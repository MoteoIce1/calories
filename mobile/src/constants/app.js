import { DEFAULT_ACTIVITY_KEY } from '../utils/kbju.js';

// Блоки дневника, которые можно скрыть в настройках профиля.
export const TOGGLEABLE_BLOCKS = [
  { key: 'calories', label: 'Калории', hint: 'счётчик калорий и прогресс дня' },
  { key: 'protein', label: 'Белок', hint: 'прогресс-бар белка' },
  { key: 'fats', label: 'Жиры', hint: 'прогресс-бар жиров' },
  { key: 'carbs', label: 'Углеводы', hint: 'прогресс-бар углеводов' },
  { key: 'steps', label: 'Шаги', hint: 'шаги и калории от ходьбы считаются отдельной строкой' },
  { key: 'workout', label: 'Силовая тренировка', hint: 'отметка тренировки' },
  { key: 'water', label: 'Вода', hint: 'учёт выпитой воды' },
  { key: 'bodyMetrics', label: 'Показатели тела', hint: 'вес, жир, БЖМ и масса жира' },
];

export const DAILY_BODY_METRICS = [
  { key: 'weight', label: 'Вес' },
  { key: 'fatPercent', label: 'Жир %' },
  { key: 'leanMass', label: 'БЖМ' },
  { key: 'fatMass', label: 'Жир кг' },
];

export const DEFAULT_USUAL_STEPS = 2000;

export const DEFAULT_PROFILE = {
  sex: 'male',
  age: '',
  height: '',
  weight: '',
  activity: DEFAULT_ACTIVITY_KEY,
  usualSteps: DEFAULT_USUAL_STEPS,
  mode: 'manual',
  deficit: 500,
};

export const DEFAULT_SETTINGS = { fontScale: 'normal', theme: 'lime', blocks: TOGGLEABLE_BLOCKS.reduce((acc, b) => ({ ...acc, [b.key]: true }), {}) };
export const WATER_QUICK = [100, 300, 500];

export const logDev = (...args) => { if (__DEV__) console.warn(...args); };

export function getUsualSteps(value) {
  const steps = Number(value);
  return Number.isFinite(steps) ? Math.max(0, Math.round(steps)) : DEFAULT_USUAL_STEPS;
}
