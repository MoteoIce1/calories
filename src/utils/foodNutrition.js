export const MACROS_CALORIE_TOLERANCE = 0.2;
export const MAX_PORTION_GRAMS = 3000;

const round1 = (value) => Math.round((Number(value) || 0) * 10) / 10;

export function caloriesFromMacros(protein, fats, carbs) {
  return (Number(protein) || 0) * 4 + (Number(fats) || 0) * 9 + (Number(carbs) || 0) * 4;
}

export function validateNutritionPer100g(data) {
  const calories = Number(data?.caloriesPer100g ?? data?.calories);
  const protein = Number(data?.proteinPer100g ?? data?.protein);
  const fats = Number(data?.fatPer100g ?? data?.fats);
  const carbs = Number(data?.carbsPer100g ?? data?.carbs);

  if (!Number.isFinite(calories) || calories <= 0) {
    return { valid: false, reason: 'calories', message: 'Калорийность должна быть больше нуля.' };
  }
  if (!Number.isFinite(protein) || protein < 0) {
    return { valid: false, reason: 'protein', message: 'Белки не могут быть отрицательными.' };
  }
  if (!Number.isFinite(fats) || fats < 0) {
    return { valid: false, reason: 'fats', message: 'Жиры не могут быть отрицательными.' };
  }
  if (!Number.isFinite(carbs) || carbs < 0) {
    return { valid: false, reason: 'carbs', message: 'Углеводы не могут быть отрицательными.' };
  }
  if (calories > 900) {
    return { valid: false, reason: 'too_high', message: 'Калорийность на 100 г выглядит слишком высокой.' };
  }

  const fromMacros = caloriesFromMacros(protein, fats, carbs);
  const diff = Math.abs(calories - fromMacros) / calories;
  if (fromMacros > 0 && diff > MACROS_CALORIE_TOLERANCE) {
    return {
      valid: false,
      reason: 'macro_mismatch',
      message: 'Калорийность заметно не совпадает с расчётом по БЖУ. Проверьте значения.',
      diff,
    };
  }

  return {
    valid: true,
    values: {
      calories: round1(calories),
      protein: round1(protein),
      fats: round1(fats),
      carbs: round1(carbs),
    },
  };
}

export function validatePortionGrams(raw) {
  const normalized = String(raw ?? '').trim().replace(',', '.');
  if (!normalized) {
    return { valid: false, error: 'Введите корректный вес продукта в граммах' };
  }

  const grams = Number(normalized);
  if (!Number.isFinite(grams) || grams <= 0) {
    return { valid: false, error: 'Введите корректный вес продукта в граммах' };
  }

  if (grams > MAX_PORTION_GRAMS) {
    return {
      valid: true,
      grams,
      warning: 'Проверьте вес порции — значение выглядит слишком большим',
    };
  }

  return { valid: true, grams, warning: null };
}

export function calculateFoodPortion(food, grams) {
  const portionGrams = Number(grams);
  if (!Number.isFinite(portionGrams) || portionGrams <= 0) return null;

  return {
    calories: Math.round(((Number(food?.calories) || 0) * portionGrams) / 100),
    protein: round1(((Number(food?.protein) || 0) * portionGrams) / 100),
    fats: round1(((Number(food?.fats) || 0) * portionGrams) / 100),
    carbs: round1(((Number(food?.carbs) || 0) * portionGrams) / 100),
  };
}
