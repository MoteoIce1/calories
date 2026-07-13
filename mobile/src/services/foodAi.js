// Портировано из web src/services/foodAi.js без изменения бизнес-логики.
// Отличие только в источнике конфига: import.meta.env → process.env (EXPO_PUBLIC_*).
import { validateNutritionPer100g } from '../utils/foodNutrition.js';

export const DEFAULT_AI_API_BASE_URL = 'https://api.moteotracker.ru:8443';
export const MAX_FOOD_TEXT_LENGTH = 500;
export const MAX_FOOD_NAME_LENGTH = 120;
export const AI_UNAVAILABLE_MESSAGE = 'ИИ временно недоступен. Можно добавить продукт вручную.';
export const AI_ESTIMATE_ERROR_MESSAGE = 'Не удалось рассчитать КБЖУ. Попробуйте ещё раз или добавьте значения вручную.';
export const VAGUE_FOOD_QUERY_MESSAGE = 'Уточните название продукта или блюда, например: курица с рисом, омлет или пицца Маргарита.';
export const SEARCH_UNAVAILABLE_MESSAGE = 'Не удалось проверить базу продуктов. Повторите попытку.';

const SUPPORTED_UNITS = new Set(['g', 'kg', 'ml', 'l', 'pcs', 'unknown']);

export class FoodAiInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FoodAiInputError';
  }
}

export class FoodAiUnavailableError extends Error {
  constructor(message = AI_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = 'FoodAiUnavailableError';
  }
}

export function getFoodAiBaseUrl(env = process.env) {
  const configuredUrl = typeof env?.EXPO_PUBLIC_API_BASE_URL === 'string'
    ? env.EXPO_PUBLIC_API_BASE_URL.trim()
    : '';
  return (configuredUrl || DEFAULT_AI_API_BASE_URL).replace(/\/+$/, '');
}

function asNullableFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeItem(item) {
  const name = typeof item?.name === 'string' ? item.name.trim() : '';
  if (!name) return null;

  return {
    name,
    amount: asNullableFiniteNumber(item.amount),
    unit: SUPPORTED_UNITS.has(item.unit) ? item.unit : 'unknown',
    amount_g: asNullableFiniteNumber(item.amount_g),
    confidence: asNullableFiniteNumber(item.confidence) ?? 0,
  };
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
}

export function formatParsedFoodAmount(item) {
  if (item.amount === null) return 'Количество не указано';

  const unitLabels = { g: 'г', kg: 'кг', ml: 'мл', l: 'л', pcs: 'шт' };
  return unitLabels[item.unit]
    ? `${formatNumber(item.amount)} ${unitLabels[item.unit]}`
    : `${formatNumber(item.amount)} · единица не указана`;
}

export async function parseFoodText(text, { fetchImpl = fetch, env = process.env } = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new FoodAiInputError('Введите продукты для распознавания.');
  }
  if (text.length > MAX_FOOD_TEXT_LENGTH) {
    throw new FoodAiInputError(`Текст не должен быть длиннее ${MAX_FOOD_TEXT_LENGTH} символов.`);
  }

  let response;
  try {
    response = await fetchImpl(`${getFoodAiBaseUrl(env)}/api/ai/parse-food`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() }),
    });
  } catch (error) {
    throw new FoodAiUnavailableError();
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new FoodAiUnavailableError();
  }

  if (!response.ok) {
    if (response.status === 503 || data?.error === 'AI temporarily unavailable') {
      throw new FoodAiUnavailableError();
    }
    throw new FoodAiInputError(data?.error || 'Не удалось распознать продукты. Проверьте текст.');
  }

  const items = Array.isArray(data?.items) ? data.items.map(normalizeItem).filter(Boolean) : [];
  if (!items.length) {
    throw new FoodAiInputError('Уточните продукт или блюдо, например: курица с рисом, омлет, пицца Маргарита.');
  }

  return { items, provider: typeof data.provider === 'string' ? data.provider : 'unknown' };
}

const VAGUE_QUERY_PATTERNS = [
  /что[\s-]?то\s+вкусн/i,
  /мой\s+(ужин|обед|завтрак|перекус)/i,
  /кусок\s+ед/i,
  /^тарелка$/i,
  /что[\s-]?то\s+съел/i,
  /моя\s+еда/i,
];

export function isVagueFoodQuery(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed.length < 3) return true;
  return VAGUE_QUERY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function normalizeAiEstimatePayload(raw, fallbackName) {
  const name = typeof raw?.name === 'string' && raw.name.trim()
    ? raw.name.trim()
    : String(fallbackName || '').trim();
  if (!name) return null;

  return {
    name,
    normalizedName: typeof raw?.normalizedName === 'string' ? raw.normalizedName.trim() : name,
    caloriesPer100g: asNullableFiniteNumber(raw?.caloriesPer100g ?? raw?.calories),
    proteinPer100g: asNullableFiniteNumber(raw?.proteinPer100g ?? raw?.protein),
    fatPer100g: asNullableFiniteNumber(raw?.fatPer100g ?? raw?.fats),
    carbsPer100g: asNullableFiniteNumber(raw?.carbsPer100g ?? raw?.carbs),
    source: typeof raw?.source === 'string' ? raw.source : 'ai_estimate',
    isAiGenerated: raw?.isAiGenerated !== false,
    confidence: asNullableFiniteNumber(raw?.confidence) ?? 0.5,
    notes: typeof raw?.notes === 'string' ? raw.notes.trim() : '',
    approximate: Boolean(raw?.approximate),
  };
}

function ensureValidEstimate(estimate) {
  if (!estimate) return null;
  const validation = validateNutritionPer100g(estimate);
  if (!validation.valid) return null;
  return {
    ...estimate,
    caloriesPer100g: validation.values.calories,
    proteinPer100g: validation.values.protein,
    fatPer100g: validation.values.fats,
    carbsPer100g: validation.values.carbs,
  };
}

async function requestAiEstimate(name, { fetchImpl, env }) {
  const response = await fetchImpl(`${getFoodAiBaseUrl(env)}/api/ai/estimate-food`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  });

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new FoodAiUnavailableError(AI_ESTIMATE_ERROR_MESSAGE);
  }

  if (!response.ok) {
    if (response.status === 503 || data?.error === 'AI temporarily unavailable') {
      throw new FoodAiUnavailableError(AI_ESTIMATE_ERROR_MESSAGE);
    }
    if (response.status === 400 && data?.error) {
      throw new FoodAiInputError(data.error);
    }
    if (response.status === 404) {
      return null;
    }
    throw new FoodAiUnavailableError(AI_ESTIMATE_ERROR_MESSAGE);
  }

  return normalizeAiEstimatePayload(data, name);
}

function mapStaticEstimateToAiPayload(estimate) {
  if (!estimate) return null;
  return normalizeAiEstimatePayload({
    name: estimate.name,
    normalizedName: estimate.normalizedName,
    caloriesPer100g: estimate.calories,
    proteinPer100g: estimate.protein,
    fatPer100g: estimate.fats,
    carbsPer100g: estimate.carbs,
    source: 'ai_estimate',
    isAiGenerated: true,
    confidence: estimate.confidence,
    notes: 'Средняя оценка для типового продукта или блюда.',
    approximate: (estimate.confidence ?? 1) < 0.75,
  }, estimate.name);
}

export async function estimateFoodNutrition(name, {
  fetchImpl = fetch,
  env = process.env,
  findStaticEstimate,
} = {}) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    throw new FoodAiInputError('Введите название продукта или блюда.');
  }
  if (trimmed.length > MAX_FOOD_NAME_LENGTH) {
    throw new FoodAiInputError(`Название не должно быть длиннее ${MAX_FOOD_NAME_LENGTH} символов.`);
  }
  if (isVagueFoodQuery(trimmed)) {
    throw new FoodAiInputError(VAGUE_FOOD_QUERY_MESSAGE);
  }

  let apiEstimate = null;
  try {
    apiEstimate = await requestAiEstimate(trimmed, { fetchImpl, env });
  } catch (error) {
    if (error instanceof FoodAiInputError) throw error;
    if (!(error instanceof FoodAiUnavailableError)) {
      throw new FoodAiUnavailableError(AI_ESTIMATE_ERROR_MESSAGE);
    }
    apiEstimate = null;
  }

  if (apiEstimate) {
    const validated = ensureValidEstimate(apiEstimate);
    if (validated) return validated;
  }

  const staticEstimate = findStaticEstimate?.(trimmed) ?? null;
  const mappedStatic = mapStaticEstimateToAiPayload(staticEstimate);
  const validatedStatic = ensureValidEstimate(mappedStatic);
  if (validatedStatic) return validatedStatic;

  throw new FoodAiUnavailableError(AI_ESTIMATE_ERROR_MESSAGE);
}
