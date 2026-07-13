import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyAiEstimate,
  applySearchResult,
  buildFoodFromEstimate,
  createRecognitionItem,
  FLOW_STEP,
  parseNutritionDraft,
} from '../src/utils/foodRecognitionFlow.js';

test('createRecognitionItem keeps grams empty when amount_g is null', () => {
  const item = createRecognitionItem({
    name: 'гречка',
    amount: null,
    unit: 'unknown',
    amount_g: null,
    confidence: 1,
  }, 0);

  assert.equal(item.grams, '');
  assert.equal(item.flowStep, FLOW_STEP.IDLE);
});

test('applySearchResult maps exact and similar matches to flow steps', () => {
  const base = createRecognitionItem({ name: 'яйцо', amount: null, unit: 'unknown', amount_g: null, confidence: 1 }, 0);
  const exactFood = { id: '1', name: 'Яйцо жареное', calories: 205, protein: 13, fats: 16, carbs: 1 };

  const exact = applySearchResult(base, { type: 'exact', match: exactFood, suggestions: [], score: 1000 });
  assert.equal(exact.flowStep, FLOW_STEP.EXACT_MATCH);
  assert.equal(exact.food.id, '1');

  const similar = applySearchResult(base, { type: 'similar', match: null, suggestions: [exactFood], score: 900 });
  assert.equal(similar.flowStep, FLOW_STEP.SIMILAR_MATCH);
  assert.equal(similar.suggestions.length, 1);
});

test('buildFoodFromEstimate creates unsaved draft food model', () => {
  const food = buildFoodFromEstimate({
    name: 'Пицца Маргарита',
    normalizedName: 'пицца маргарита',
    caloriesPer100g: 250,
    proteinPer100g: 10,
    fatPer100g: 9,
    carbsPer100g: 32,
    confidence: 0.78,
    source: 'ai_estimate',
  }, 'draft-1');

  assert.equal(food.id, 'draft-1');
  assert.equal(food.calories, 250);
  assert.equal(food.isAiGenerated, true);
  assert.ok(food.createdAt);
});

test('applyAiEstimate does not mark product as saved', () => {
  const base = createRecognitionItem({ name: 'омлет', amount: null, unit: 'unknown', amount_g: null, confidence: 1 }, 0);
  const updated = applyAiEstimate(base, {
    name: 'Омлет',
    caloriesPer100g: 150,
    proteinPer100g: 10,
    fatPer100g: 11,
    carbsPer100g: 2,
    confidence: 0.75,
    approximate: true,
  });

  assert.equal(updated.flowStep, FLOW_STEP.AI_RESULT);
  assert.ok(updated.draftFood);
  assert.equal(updated.food, null);
});

test('parseNutritionDraft validates edited values', () => {
  assert.deepEqual(parseNutritionDraft({
    calories: '250',
    protein: '10',
    fats: '9',
    carbs: '32',
  }), {
    calories: 250,
    protein: 10,
    fats: 9,
    carbs: 32,
  });
  assert.equal(parseNutritionDraft({ calories: '0', protein: '1', fats: '1', carbs: '1' }), null);
});
