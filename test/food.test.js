import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  calculateFoodPortion,
  createEstimatedFood,
  findBestFoodMatch,
  normalizeFoodName,
} from '../src/utils/food.js';

test('normalizes Russian and English margherita pizza variants to a comparable key', () => {
  assert.equal(normalizeFoodName('  Pizza   Margherita!! '), 'пицца маргарита');
  assert.equal(normalizeFoodName('Маргарита-пицца'), 'маргарита пицца');
});

test('finds existing product through alias and does not require duplicate creation', () => {
  const foods = [
    {
      id: 'pizza-1',
      name: 'Пицца Маргарита',
      aliases: ['pizza margherita', 'margherita pizza', 'маргарита'],
      calories: 250,
      protein: 10,
      fats: 9,
      carbs: 32,
    },
  ];

  const result = findBestFoodMatch(foods, 'pizza margherita');

  assert.equal(result.match?.id, 'pizza-1');
  assert.equal(result.score >= 900, true);
});

test('creates realistic AI-estimated margherita pizza food when it is absent from base', () => {
  const food = createEstimatedFood('Пицца Маргарита', 'ai-pizza');

  assert.equal(food.id, 'ai-pizza');
  assert.equal(food.name, 'Пицца Маргарита');
  assert.equal(food.normalizedName, 'пицца маргарита');
  assert.equal(food.calories, 250);
  assert.equal(food.protein, 10);
  assert.equal(food.fats, 9);
  assert.equal(food.carbs, 32);
  assert.equal(food.source, 'AI estimate');
  assert.equal(food.isAiGenerated, true);
  assert.equal(food.confidence, 0.75);
});

test('calculates food portion from per-100g nutrition and validates grams', () => {
  const food = { calories: 250, protein: 10, fats: 9, carbs: 32 };

  assert.deepEqual(calculateFoodPortion(food, 200), {
    calories: 500,
    protein: 20,
    fats: 18,
    carbs: 64,
  });
  assert.equal(calculateFoodPortion(food, 0), null);
  assert.equal(calculateFoodPortion(food, -10), null);
  assert.equal(calculateFoodPortion(food, Number.NaN), null);
});
