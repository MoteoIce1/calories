const assert = require('node:assert/strict');
const test = require('node:test');

const { validateNutritionPer100g } = require('../ai/nutrition');

test('validateNutritionPer100g accepts consistent macros', () => {
  const result = validateNutritionPer100g({
    caloriesPer100g: 127,
    proteinPer100g: 0.8,
    fatPer100g: 0.4,
    carbsPer100g: 33,
  });
  assert.equal(result.valid, true);
});

test('validateNutritionPer100g rejects macro mismatch', () => {
  const result = validateNutritionPer100g({
    caloriesPer100g: 250,
    proteinPer100g: 1,
    fatPer100g: 1,
    carbsPer100g: 1,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'macro_mismatch');
});
