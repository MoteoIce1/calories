export const INVALID_ACTIVITY_MODEL_ERROR = 'INVALID_ACTIVITY_MODEL';
export const KCAL_PER_STEP = 0.04;

export const ACTIVITY_LEVELS = Object.freeze([
  {
    key: 'sedentary',
    label: 'Минимальная',
    hint: 'Сидячая работа, нет тренировок, низкая бытовая активность, минимум движения кроме указанных шагов.',
    activityCalories: 100,
  },
  {
    key: 'light',
    label: 'Лёгкая',
    hint: 'Без регулярных силовых тренировок, но много дел по дому или по работе. Есть бытовая активность, перемещения, домашние дела, работа на ногах. Шаги считаются отдельно.',
    activityCalories: 250,
  },
  {
    key: 'moderate',
    label: 'Средняя',
    hint: '1–3 силовые тренировки в неделю или умеренная регулярная физическая нагрузка: дом, зал, турник, пресс, умеренный спорт. Шаги считаются отдельно.',
    activityCalories: 400,
  },
  {
    key: 'high',
    label: 'Высокая',
    hint: '3–5 тяжёлых тренировок в неделю, активная работа или сочетание регулярного спорта и высокой бытовой активности. Шаги считаются отдельно.',
    activityCalories: 600,
  },
  {
    key: 'very_high',
    label: 'Очень высокая',
    hint: '6+ тяжёлых тренировок в неделю, две тренировки в день, тяжёлая физическая работа или почти профессиональный уровень активности. Шаги считаются отдельно.',
    activityCalories: 800,
  },
]);

export const DEFAULT_ACTIVITY_KEY = 'sedentary';

export function normalizeActivityKey(activityKey) {
  const key = String(activityKey || '');
  return ACTIVITY_LEVELS.some((level) => level.key === key) ? key : DEFAULT_ACTIVITY_KEY;
}

export function getActivityLevel(activityKey) {
  const normalizedKey = normalizeActivityKey(activityKey);
  return ACTIVITY_LEVELS.find((level) => level.key === normalizedKey) || ACTIVITY_LEVELS[0];
}

export function normalizeSteps(steps) {
  const parsedSteps = Number(steps);
  return Number.isFinite(parsedSteps) ? Math.max(0, Math.round(parsedSteps)) : 0;
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

export function calculateStepsCalories(steps, kcalPerStep = KCAL_PER_STEP) {
  return Math.round(normalizeSteps(steps) * kcalPerStep);
}

export function calculateStepCalorieAdjustment(currentSteps, baseSteps, kcalPerStep = KCAL_PER_STEP) {
  return calculateStepsCalories(currentSteps, kcalPerStep) - calculateStepsCalories(baseSteps, kcalPerStep);
}

export function validateActivityModel() {
  const activityCalories = ACTIVITY_LEVELS.map((level) => level.activityCalories);
  const isValid = activityCalories.every((value, index) => (
    Number.isFinite(value)
    && value >= 0
    && (index === 0 || activityCalories[index - 1] < value)
  ));

  if (!isValid) {
    throw new Error(INVALID_ACTIVITY_MODEL_ERROR);
  }

  return true;
}

export function computeKbju(profile) {
  const bmr = calculateBmr(profile);
  if (!bmr) return null;

  validateActivityModel();

  const activityLevel = getActivityLevel(profile.activity);
  const steps = normalizeSteps(profile.dailySteps ?? profile.steps ?? profile.usualSteps);
  const stepsCalories = calculateStepsCalories(steps);
  const activityCalories = activityLevel.activityCalories;
  const maintenance = Math.round(bmr + stepsCalories + activityCalories);
  const deficit = Number(profile.deficit) || 0;
  const calories = Math.max(0, maintenance - deficit);
  const weight = parseFloat(profile.weight);
  const protein = Math.round(weight * 2);
  const fats = Math.round(weight * 0.9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fats * 9) / 4));

  return {
    bmr: Math.round(bmr),
    rawBmr: bmr,
    steps,
    kcalPerStep: KCAL_PER_STEP,
    stepsCalories,
    activityKey: activityLevel.key,
    activityLabel: activityLevel.label,
    activityCalories,
    maintenance,
    deficit,
    calories,
    protein,
    fats,
    carbs,
  };
}
