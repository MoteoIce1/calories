// Портировано из web src/services/foodAi.js без изменения бизнес-логики.
// Отличие только в источнике конфига: import.meta.env → process.env (EXPO_PUBLIC_*).
export const DEFAULT_AI_API_BASE_URL = 'https://api.moteotracker.ru:8443';
export const MAX_FOOD_TEXT_LENGTH = 500;
export const AI_UNAVAILABLE_MESSAGE = 'ИИ временно недоступен. Можно добавить продукт вручную.';

const SUPPORTED_UNITS = new Set(['g', 'kg', 'ml', 'l', 'pcs', 'unknown']);

export class FoodAiInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FoodAiInputError';
  }
}

export class FoodAiUnavailableError extends Error {
  constructor() {
    super(AI_UNAVAILABLE_MESSAGE);
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

/**
 * Разбирает описание еды через серверный AI-шлюз.
 * Ключи ИИ остаются на бэкенде; наружу уходит только текст.
 */
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
