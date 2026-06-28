import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  calculateFoodPortion,
  createEstimatedFood,
  findBestFoodMatch,
  findEstimatedNutrition,
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

test('finds fried egg variants through aliases and word order normalization', () => {
  const foods = [
    {
      id: 'egg-1',
      name: 'Яйцо жареное',
      aliases: ['жареное яйцо', 'яичница', 'fried egg'],
      calories: 205,
      protein: 13,
      fats: 16,
      carbs: 1,
    },
  ];

  assert.equal(findBestFoodMatch(foods, 'жареное яйцо').match?.id, 'egg-1');
  assert.equal(findBestFoodMatch(foods, 'fried egg').match?.id, 'egg-1');
});

test('creates realistic AI-estimated fried egg food when it is absent from base', () => {
  const food = createEstimatedFood('Яйцо жареное', 'ai-egg');

  assert.equal(food.id, 'ai-egg');
  assert.equal(food.name, 'Яйцо жареное');
  assert.equal(food.normalizedName, 'яйцо жареное');
  assert.equal(food.calories, 205);
  assert.equal(food.protein, 13);
  assert.equal(food.fats, 16);
  assert.equal(food.carbs, 1);
  assert.equal(food.source, 'AI estimate');
  assert.equal(food.isAiGenerated, true);
  assert.equal(food.confidence, 0.8);
  assert.ok(food.aliases.includes('яичница'));
  assert.ok(food.createdAt);
  assert.ok(food.updatedAt);
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

test('does not invent nutrition for vague non-product text', () => {
  assert.equal(findEstimatedNutrition('что-то вкусное'), null);
  assert.equal(createEstimatedFood('моя еда', 'ai-vague'), null);
});

test('estimates nutrition for required common products instead of falling back to manual entry', () => {
  const commonFoods = [
    'яйцо жареное',
    'яйцо вареное',
    'пицца маргарита',
    'рис вареный',
    'гречка',
    'куриная грудка',
    'банан',
    'яблоко',
    'творог',
    'йогурт',
    'суп',
    'омлет',
    'картофельное пюре',
    'макароны',
    'сырники',
    'шаурма',
    'бургер',
    'салат',
    'мясо',
    'рыба',
  ];

  for (const foodName of commonFoods) {
    const nutrition = findEstimatedNutrition(foodName);
    assert.ok(nutrition, foodName);
    assert.ok(nutrition.confidence >= 0.6, foodName);
  }
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
