export const INVALID_ACTIVITY_MODEL_ERROR = 'INVALID_ACTIVITY_MODEL';

export const ACTIVITY_MULTIPLIERS = Object.freeze({
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  very_high: 1.9,
});

export const ACTIVITY_LEVELS = Object.freeze([
  {
    key: 'sedentary',
    label: 'Минимальная',
    hint: 'сидячая работа, без тренировок, бытовая активность/NEAT низкая; шаги отдельно',
    multiplier: ACTIVITY_MULTIPLIERS.sedentary,
  },
  {
    key: 'light',
    label: 'Лёгкая',
    hint: 'без силовых тренировок, но много дел по дому или по работе; шаги отдельно',
    multiplier: ACTIVITY_MULTIPLIERS.light,
  },
  {
    key: 'moderate',
    label: 'Средняя',
    hint: '1–3 силовые тренировки в неделю или умеренная регулярная нагрузка; шаги отдельно',
    multiplier: ACTIVITY_MULTIPLIERS.moderate,
  },
  {
    key: 'high',
    label: 'Высокая',
    hint: '3–5 силовых тренировок в неделю, спорт или физически активная работа; шаги отдельно',
    multiplier: ACTIVITY_MULTIPLIERS.high,
  },
  {
    key: 'very_high',
    label: 'Очень высокая',
    hint: '6+ тяжёлых тренировок в неделю, две тренировки в день или тяжёлая физическая работа; шаги отдельно',
    multiplier: ACTIVITY_MULTIPLIERS.very_high,
  },
]);

export const DEFAULT_ACTIVITY_KEY = 'sedentary';

const LEGACY_ACTIVITY_KEY_MAP = Object.freeze({
  '1.2': 'sedentary',
  '1.375': 'light',
  '1.55': 'moderate',
  '1.725': 'high',
  '1.9': 'very_high',
});

export function normalizeActivityKey(activityKey) {
  return LEGACY_ACTIVITY_KEY_MAP[String(activityKey)] || activityKey || DEFAULT_ACTIVITY_KEY;
}

export function getActivityLevel(activityKey) {
  const normalizedKey = normalizeActivityKey(activityKey);
  return ACTIVITY_LEVELS.find((level) => level.key === normalizedKey) || ACTIVITY_LEVELS[0];
}

export function calculateBmr({ sex, weight, height, age }) {
  const parsedWeight = parseFloat(weight);
  const parsedHeight = parseFloat(height);
  const parsedAge = parseFloat(age);

  if (!parsedWeight || !parsedHeight || !parsedAge) return null;

  return (
    10 * parsedWeight
    + 6.25 * parsedHeight
    - 5 * parsedAge
    + (sex === 'female' ? -161 : 5)
  );
}

export function validateActivityModel(bmr = 1) {
  const positiveBmr = Number(bmr);
  const tdee = (key) => positiveBmr * ACTIVITY_MULTIPLIERS[key];

  const isValid = positiveBmr > 0
    && tdee('sedentary') < tdee('light')
    && tdee('light') < tdee('moderate')
    && tdee('moderate') < tdee('high')
    && tdee('high') < tdee('very_high');

  if (!isValid) {
    throw new Error(INVALID_ACTIVITY_MODEL_ERROR);
  }

  return true;
}

export function computeKbju(profile) {
  const bmr = calculateBmr(profile);
  if (!bmr) return null;

  validateActivityModel(bmr);

  const activityLevel = getActivityLevel(profile.activity);
  const maintenance = Math.round(bmr * activityLevel.multiplier);
  const deficit = Number(profile.deficit) || 0;
  const calories = Math.max(0, maintenance - deficit);
  const weight = parseFloat(profile.weight);
  const protein = Math.round(weight * 2);
  const fats = Math.round(weight * 1);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fats * 9) / 4));

  return {
    bmr: Math.round(bmr),
    activityKey: activityLevel.key,
    activityMultiplier: activityLevel.multiplier,
    maintenance,
    calories,
    protein,
    fats,
    carbs,
  };
}
