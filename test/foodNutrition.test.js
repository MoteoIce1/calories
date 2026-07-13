import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  calculateFoodPortion,
  caloriesFromMacros,
  validateNutritionPer100g,
  validatePortionGrams,
} from '../src/utils/foodNutrition.js';

test('validates per-100g nutrition and macro-calorie consistency', () => {
  const valid = validateNutritionPer100g({
    caloriesPer100g: 250,
    proteinPer100g: 10,
    fatPer100g: 9,
    carbsPer100g: 32,
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.values.calories, 250);
});

test('rejects impossible macro mismatch', () => {
  const invalid = validateNutritionPer100g({
    caloriesPer100g: 250,
    proteinPer100g: 1,
    fatPer100g: 1,
    carbsPer100g: 1,
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.reason, 'macro_mismatch');
});

test('caloriesFromMacros uses standard factors', () => {
  assert.equal(caloriesFromMacros(10, 9, 32), 10 * 4 + 9 * 9 + 32 * 4);
});

test('validatePortionGrams rejects invalid values and warns on large portions', () => {
  assert.equal(validatePortionGrams('').valid, false);
  assert.equal(validatePortionGrams('0').valid, false);
  assert.equal(validatePortionGrams('-10').valid, false);
  assert.equal(validatePortionGrams('abc').valid, false);
  assert.equal(validatePortionGrams('150').valid, true);
  assert.equal(validatePortionGrams('150').grams, 150);
  assert.match(validatePortionGrams('3500').warning || '', /слишком больш/i);
});

test('calculateFoodPortion rounds macros to one decimal', () => {
  const food = { calories: 250, protein: 10, fats: 9, carbs: 32 };
  assert.deepEqual(calculateFoodPortion(food, 200), {
    calories: 500,
    protein: 20,
    fats: 18,
    carbs: 64,
  });
  assert.deepEqual(calculateFoodPortion(food, 33), {
    calories: 83,
    protein: 3.3,
    fats: 3,
    carbs: 10.6,
  });
});
