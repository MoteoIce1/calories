import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyFoodSearch, extractFoodAttributes } from '../src/utils/foodMatch.js';

test('classifies exact margherita pizza match', () => {
  const foods = [{
    id: 'pizza-1',
    name: 'Пицца Маргарита',
    aliases: ['pizza margherita'],
    calories: 250,
    protein: 10,
    fats: 9,
    carbs: 32,
  }];

  const result = classifyFoodSearch(foods, 'pizza margherita');
  assert.equal(result.type, 'exact');
  assert.equal(result.match?.id, 'pizza-1');
});

test('does not treat fried egg as exact match for boiled egg in base', () => {
  const foods = [{
    id: 'egg-boiled',
    name: 'Яйцо вареное',
    calories: 155,
    protein: 13,
    fats: 11,
    carbs: 1,
  }];

  const result = classifyFoodSearch(foods, 'Яйцо жареное');
  assert.equal(result.type, 'similar');
  assert.equal(result.match, null);
  assert.equal(result.conflictingFood?.id, 'egg-boiled');
});

test('detects cooking method and fat percent attributes', () => {
  assert.equal(extractFoodAttributes('Творог 5%').fatPercent, 5);
  assert.equal(extractFoodAttributes('Яйцо жареное').cooking, 'fried');
  assert.equal(extractFoodAttributes('Рис вареный').cooking, 'boiled');
});

test('does not auto-match different dish variants', () => {
  const foods = [{
    id: 'pizza-4cheese',
    name: 'Пицца четыре сыра',
    calories: 280,
    protein: 12,
    fats: 12,
    carbs: 30,
  }];

  const result = classifyFoodSearch(foods, 'Пицца Маргарита');
  assert.notEqual(result.type, 'exact');
});
