const EXTRA_ACTIVITY_TYPES = [
  { key: 'football', label: 'Футбол', defaultCalories: 400, hint: 'Обычно 300–700 ккал/час' },
  { key: 'snowboard', label: 'Сноуборд', defaultCalories: 350, hint: 'Обычно 250–600 ккал/час' },
  { key: 'strength', label: 'Силовая тренировка', defaultCalories: 250, hint: 'Обычно 150–400 ккал/тренировка' },
  { key: 'run', label: 'Бег', defaultCalories: 400, hint: 'Обычно 300–800 ккал/час' },
  { key: 'bike', label: 'Велосипед', defaultCalories: 300, hint: 'Обычно 200–600 ккал/час' },
  { key: 'swim', label: 'Плавание', defaultCalories: 350, hint: 'Обычно 250–700 ккал/час' },
  { key: 'walk', label: 'Долгая прогулка', defaultCalories: 200, hint: 'Обычно 150–350 ккал/час' },
  { key: 'other', label: 'Другое', defaultCalories: '', hint: 'Введите примерный расход вручную' },
];

const getExtraActivityType = (key) => (
  EXTRA_ACTIVITY_TYPES.find((activity) => activity.key === key) || EXTRA_ACTIVITY_TYPES[0]
);

const normalizeExtraActivities = (activities = []) => (
  Array.isArray(activities)
    ? activities
        .map((activity) => {
          const type = getExtraActivityType(activity?.type);
          const calories = Math.round(Number(activity?.calories) || 0);
          if (!activity?.id || calories <= 0) return null;
          return {
            id: String(activity.id),
            type: type.key,
            name: activity.name || type.label,
            calories,
            createdAt: activity.createdAt || '',
            updatedAt: activity.updatedAt || activity.createdAt || '',
          };
        })
        .filter(Boolean)
    : []
);

const sumExtraActivityCalories = (activities = []) => (
  normalizeExtraActivities(activities).reduce((sum, activity) => sum + activity.calories, 0)
);

const calculateDailyAvailableCalories = (targetCalories, activities = []) => (
  Math.max(0, Math.round(Number(targetCalories) || 0) + sumExtraActivityCalories(activities))
);

const validateExtraActivityCalories = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: false, value: null, error: 'Введите количество калорий', warning: '' };
  const calories = Math.round(Number(raw));
  if (!Number.isFinite(calories)) return { ok: false, value: null, error: 'Введите количество калорий', warning: '' };
  if (calories < 0) return { ok: false, value: calories, error: 'Калории не могут быть отрицательными', warning: '' };
  if (calories === 0) return { ok: false, value: calories, error: 'Калории должны быть больше 0', warning: '' };
  return {
    ok: true,
    value: calories,
    error: '',
    warning: calories > 3000 ? 'Проверьте значение. Это очень большой расход за одну активность.' : '',
  };
};

export {
  EXTRA_ACTIVITY_TYPES,
  calculateDailyAvailableCalories,
  getExtraActivityType,
  normalizeExtraActivities,
  sumExtraActivityCalories,
  validateExtraActivityCalories,
};
