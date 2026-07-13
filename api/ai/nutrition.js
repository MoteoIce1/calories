const MACROS_CALORIE_TOLERANCE = 0.2;

const round1 = (value) => Math.round((Number(value) || 0) * 10) / 10;

function caloriesFromMacros(protein, fats, carbs) {
  return (Number(protein) || 0) * 4 + (Number(fats) || 0) * 9 + (Number(carbs) || 0) * 4;
}

function validateNutritionPer100g(data) {
  const calories = Number(data?.caloriesPer100g ?? data?.calories);
  const protein = Number(data?.proteinPer100g ?? data?.protein);
  const fats = Number(data?.fatPer100g ?? data?.fats);
  const carbs = Number(data?.carbsPer100g ?? data?.carbs);

  if (!Number.isFinite(calories) || calories <= 0) {
    return { valid: false, reason: 'calories' };
  }
  if (!Number.isFinite(protein) || protein < 0) {
    return { valid: false, reason: 'protein' };
  }
  if (!Number.isFinite(fats) || fats < 0) {
    return { valid: false, reason: 'fats' };
  }
  if (!Number.isFinite(carbs) || carbs < 0) {
    return { valid: false, reason: 'carbs' };
  }
  if (calories > 900) {
    return { valid: false, reason: 'too_high' };
  }

  const fromMacros = caloriesFromMacros(protein, fats, carbs);
  const diff = Math.abs(calories - fromMacros) / calories;
  if (fromMacros > 0 && diff > MACROS_CALORIE_TOLERANCE) {
    return { valid: false, reason: 'macro_mismatch', diff };
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

module.exports = {
  MACROS_CALORIE_TOLERANCE,
  caloriesFromMacros,
  validateNutritionPer100g,
};
