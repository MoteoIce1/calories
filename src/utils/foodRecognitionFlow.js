import { normalizeFoodName } from './food.js';
import { validateNutritionPer100g } from './foodNutrition.js';

export const FLOW_STEP = {
  IDLE: 'idle',
  SEARCHING: 'searching',
  EXACT_MATCH: 'exact_match',
  SIMILAR_MATCH: 'similar_matches',
  AI_ESTIMATING: 'ai_estimating',
  AI_RESULT: 'ai_result',
  EDITING: 'editing',
  SAVING_PRODUCT: 'saving_product',
  PRODUCT_SAVED: 'product_saved',
  ENTERING_GRAMS: 'entering_grams',
  PORTION_PREVIEW: 'portion_preview',
  SAVING_DIARY: 'saving_diary',
  SUCCESS: 'success',
  ERROR: 'error',
};

export function createRecognitionItem(parsedItem, index) {
  return {
    ...parsedItem,
    flowStep: FLOW_STEP.IDLE,
    query: parsedItem.name,
    grams: parsedItem.amount_g === null ? '' : String(parsedItem.amount_g),
    food: null,
    draftFood: null,
    suggestions: [],
    conflictingFood: null,
    statusText: '',
    error: '',
    warning: '',
    nutritionDraft: null,
    nutritionError: '',
    portionError: '',
    portionWarning: '',
    savingProduct: false,
    savingDiary: false,
    operationId: null,
    added: false,
    addedMessage: '',
    showPortionPreview: false,
    index,
  };
}

export function applySearchResult(item, searchResult) {
  if (searchResult.type === 'exact') {
    return {
      ...item,
      flowStep: FLOW_STEP.EXACT_MATCH,
      food: searchResult.match,
      matchedFoodId: searchResult.match.id,
      statusText: 'Продукт найден в базе',
      suggestions: [],
      conflictingFood: null,
      error: '',
    };
  }

  if (searchResult.type === 'similar') {
    return {
      ...item,
      flowStep: FLOW_STEP.SIMILAR_MATCH,
      food: null,
      matchedFoodId: null,
      suggestions: searchResult.suggestions,
      conflictingFood: searchResult.conflictingFood,
      statusText: 'В базе найден похожий продукт',
      error: '',
    };
  }

  return {
    ...item,
    flowStep: FLOW_STEP.AI_ESTIMATING,
    statusText: 'Продукта нет в базе. Рассчитываем КБЖУ…',
    error: '',
  };
}

export function buildFoodFromEstimate(estimate, id) {
  const validation = validateNutritionPer100g(estimate);
  if (!validation.valid) return null;

  const now = new Date().toISOString();
  const { calories, protein, fats, carbs } = validation.values;

  return {
    id: id || `ai-${Date.now()}`,
    name: String(estimate.name || '').trim(),
    normalizedName: normalizeFoodName(estimate.normalizedName || estimate.name),
    aliases: Array.isArray(estimate.aliases) ? estimate.aliases : [],
    calories,
    protein,
    fats,
    carbs,
    caloriesPer100g: calories,
    proteinPer100g: protein,
    fatPer100g: fats,
    carbsPer100g: carbs,
    source: estimate.source || 'ai_estimate',
    isAiGenerated: estimate.isAiGenerated !== false,
    confidence: Number.isFinite(Number(estimate.confidence)) ? Number(estimate.confidence) : 0.5,
    notes: String(estimate.notes || '').trim(),
    createdAt: now,
    updatedAt: now,
  };
}

export function applyAiEstimate(item, estimate) {
  const draftFood = buildFoodFromEstimate(estimate, `ai-${Date.now()}-${item.index ?? 0}`);
  if (!draftFood) {
    return {
      ...item,
      flowStep: FLOW_STEP.ERROR,
      error: 'ИИ вернул некорректные значения КБЖУ. Попробуйте изменить значения вручную.',
    };
  }

  return {
    ...item,
    flowStep: FLOW_STEP.AI_RESULT,
    draftFood,
    food: null,
    matchedFoodId: null,
    statusText: estimate.approximate
      ? 'Нет в базе · приблизительная оценка ИИ'
      : 'Нет в базе · оценка ИИ',
    nutritionDraft: makeNutritionDraft(draftFood),
    error: '',
    warning: estimate.approximate
      ? 'КБЖУ рассчитано приблизительно, поскольку состав и способ приготовления могут отличаться.'
      : (estimate.notes || ''),
  };
}

export function makeNutritionDraft(food) {
  return {
    calories: String(food?.calories ?? ''),
    protein: String(food?.protein ?? ''),
    fats: String(food?.fats ?? ''),
    carbs: String(food?.carbs ?? ''),
  };
}

export function parseNutritionDraft(draft) {
  const read = (key) => Number.parseFloat(String(draft?.[key] ?? '').replace(',', '.'));
  const values = {
    calories: read('calories'),
    protein: read('protein'),
    fats: read('fats'),
    carbs: read('carbs'),
  };
  const validation = validateNutritionPer100g(values);
  return validation.valid ? validation.values : null;
}

export function applyProductSaved(item, food) {
  return {
    ...item,
    flowStep: FLOW_STEP.PRODUCT_SAVED,
    food,
    draftFood: null,
    matchedFoodId: food.id,
    statusText: 'Продукт добавлен в базу',
    savingProduct: false,
    nutritionError: '',
    error: '',
  };
}

export function applyExactFoodSelected(item, food) {
  return {
    ...item,
    flowStep: FLOW_STEP.ENTERING_GRAMS,
    food,
    matchedFoodId: food.id,
    draftFood: null,
    suggestions: [],
    conflictingFood: null,
    statusText: 'Продукт найден в базе',
    error: '',
  };
}

export function canShowGramsInput(item) {
  return [
    FLOW_STEP.EXACT_MATCH,
    FLOW_STEP.PRODUCT_SAVED,
    FLOW_STEP.ENTERING_GRAMS,
    FLOW_STEP.PORTION_PREVIEW,
  ].includes(item.flowStep) && Boolean(item.food);
}

export function canShowAiPreview(item) {
  return [FLOW_STEP.AI_RESULT, FLOW_STEP.EDITING].includes(item.flowStep) && Boolean(item.draftFood);
}

export function getActiveFood(item) {
  return item.food || item.draftFood || null;
}

export function createOperationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
