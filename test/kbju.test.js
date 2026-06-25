import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVITY_LEVELS,
  calculateBmr,
  calculateStepsCalories,
  computeKbju,
  normalizeActivityKey,
  validateActivityModel,
} from '../src/utils/kbju.js';

const baseProfile = {
  sex: 'male',
  age: 30,
  height: 180,
  weight: 80,
  usualSteps: 6000,
  deficit: 0,
};

test('calculates BMR with Mifflin-St Jeor', () => {
  assert.equal(Math.round(calculateBmr(baseProfile)), 1780);
  assert.equal(Math.round(calculateBmr({ ...baseProfile, sex: 'female' })), 1614);
});

test('calculates step calories as a separate steps x 0.04 line', () => {
  assert.equal(calculateStepsCalories(6000), 240);
  assert.equal(calculateStepsCalories(0), 0);
});

test('calculates TDEE additively as BMR + stepsCalories + activityCalories', () => {
  const result = computeKbju({ ...baseProfile, activity: 'moderate' });

  assert.equal(result.bmr, 1780);
  assert.equal(result.stepsCalories, 240);
  assert.equal(result.activityCalories, 400);
  assert.equal(result.maintenance, 2420);
});

test('sex affects only BMR before the same step and activity additions are applied', () => {
  const male = computeKbju({ ...baseProfile, sex: 'male', activity: 'light' });
  const female = computeKbju({ ...baseProfile, sex: 'female', activity: 'light' });

  assert.equal(male.stepsCalories, female.stepsCalories);
  assert.equal(male.activityCalories, female.activityCalories);
  assert.equal(male.bmr - female.bmr, 166);
  assert.equal(male.maintenance - female.maintenance, 166);
});

test('activity calories are strictly increasing for identical input data', () => {
  const sedentary = computeKbju({ ...baseProfile, activity: 'sedentary' }).maintenance;
  const light = computeKbju({ ...baseProfile, activity: 'light' }).maintenance;
  const moderate = computeKbju({ ...baseProfile, activity: 'moderate' }).maintenance;
  const high = computeKbju({ ...baseProfile, activity: 'high' }).maintenance;
  const veryHigh = computeKbju({ ...baseProfile, activity: 'very_high' }).maintenance;

  assert.ok(sedentary < light);
  assert.ok(light < moderate);
  assert.ok(moderate < high);
  assert.ok(high < veryHigh);
});

test('activity model validator throws INVALID_ACTIVITY_MODEL if fixed additions cannot be valid', () => {
  assert.equal(validateActivityModel(), true);
});

test('old numeric activity values are ignored instead of being used as multipliers', () => {
  assert.equal(normalizeActivityKey('1.55'), 'sedentary');

  const legacyNumeric = computeKbju({ ...baseProfile, activity: '1.55' });
  const sedentary = computeKbju({ ...baseProfile, activity: 'sedentary' });

  assert.deepEqual(legacyNumeric, sedentary);
  assert.equal('activityMultiplier' in legacyNumeric, false);
});

test('required 70kg example produces about 1770-1800 kcal target and never 2030', () => {
  const result = computeKbju({
    sex: 'male',
    age: 27,
    height: 170,
    weight: 70,
    usualSteps: 6000,
    activity: 'moderate',
    deficit: 500,
  });

  assert.equal(result.bmr, 1633);
  assert.equal(result.stepsCalories, 240);
  assert.equal(result.activityCalories, 400);
  assert.equal(result.maintenance, 2273);
  assert.equal(result.calories, 1773);
  assert.notEqual(result.calories, 2030);
  assert.ok(result.calories >= 1770 && result.calories <= 1800);
});

test('macros are recalculated from the new target calories', () => {
  const result = computeKbju({
    sex: 'male',
    age: 27,
    height: 170,
    weight: 70,
    usualSteps: 6000,
    activity: 'moderate',
    deficit: 500,
  });

  assert.equal(result.protein, 140);
  assert.equal(result.fats, 63);
  assert.equal(result.carbs, 162);
});

test('activity level descriptions explain NEAT/training meaning while keeping steps separate', () => {
  const byKey = Object.fromEntries(ACTIVITY_LEVELS.map((level) => [level.key, level]));

  assert.match(byKey.sedentary.hint, /Сидячая работа/i);
  assert.match(byKey.light.hint, /дому|работе/i);
  assert.match(byKey.moderate.hint, /1–3 силовые тренировки/i);
  assert.match(byKey.high.hint, /3–5 тяжёлых тренировок/i);
  assert.match(byKey.very_high.hint, /6\+ тяжёлых тренировок/i);

  for (const level of ACTIVITY_LEVELS) {
    assert.match(level.hint, /Шаги считаются отдельно|указанных шагов/i);
  }
});
