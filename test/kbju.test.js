import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVITY_MULTIPLIERS,
  computeKbju,
  normalizeActivityKey,
  validateActivityModel,
} from '../src/utils/kbju.js';

const baseProfile = {
  sex: 'male',
  age: 30,
  height: 180,
  weight: 80,
  deficit: 0,
};

test('calculates BMR with Mifflin-St Jeor and TDEE as BMR multiplied only by activity', () => {
  const result = computeKbju({ ...baseProfile, activity: 'moderate' });

  assert.equal(result.bmr, 1780);
  assert.equal(result.activityMultiplier, ACTIVITY_MULTIPLIERS.moderate);
  assert.equal(result.maintenance, Math.round(1780 * 1.55));
});

test('sex affects only BMR before the same activity multiplier is applied', () => {
  const male = computeKbju({ ...baseProfile, sex: 'male', activity: 'light' });
  const female = computeKbju({ ...baseProfile, sex: 'female', activity: 'light' });

  assert.equal(male.activityMultiplier, female.activityMultiplier);
  assert.equal(male.bmr - female.bmr, 166);
  assert.equal(male.maintenance, Math.round(male.bmr * male.activityMultiplier));
  assert.equal(female.maintenance, Math.round(female.bmr * female.activityMultiplier));
});

test('activity TDEE is strictly increasing for identical input data', () => {
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

test('activity model validator throws INVALID_ACTIVITY_MODEL if ordering cannot be valid', () => {
  assert.equal(validateActivityModel(1780), true);
  assert.throws(() => validateActivityModel(0), /INVALID_ACTIVITY_MODEL/);
});

test('legacy numeric activity keys are normalized without using old custom formulas', () => {
  assert.equal(normalizeActivityKey('1.2'), 'sedentary');
  assert.equal(normalizeActivityKey('1.375'), 'light');
  assert.equal(normalizeActivityKey('1.55'), 'moderate');
  assert.equal(normalizeActivityKey('1.725'), 'high');
  assert.equal(normalizeActivityKey('1.9'), 'very_high');

  const legacyLight = computeKbju({ ...baseProfile, activity: '1.375' });
  const modernLight = computeKbju({ ...baseProfile, activity: 'light' });

  assert.deepEqual(legacyLight, modernLight);
});

test('steps do not change the computed TDEE', () => {
  const lowSteps = computeKbju({ ...baseProfile, activity: 'moderate', usualSteps: 1000 });
  const highSteps = computeKbju({ ...baseProfile, activity: 'moderate', usualSteps: 20000 });

  assert.equal(lowSteps.maintenance, highSteps.maintenance);
  assert.equal(lowSteps.calories, highSteps.calories);
});
