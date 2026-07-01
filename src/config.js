import { DEFAULT_ACTIVITY_KEY } from './utils/kbju.js';

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
export const NON_SELECTABLE_INPUT_TYPES = [
  'button',
  'checkbox',
  'color',
  'date',
  'file',
  'hidden',
  'radio',
  'range',
  'reset',
  'submit',
];

// Темы оформления (выбираются в профиле). bg/dot — для превью-чипа.
export const THEMES = [
  { key: 'lime', label: 'Тёмная · лайм', bg: '#0a0a0b', dot: '#a3e635' },
  { key: 'sky', label: 'Тёмная · голубая', bg: '#0a0a0b', dot: '#38bdf8' },
  { key: 'violet', label: 'Тёмная · фиолетовая', bg: '#0a0a0b', dot: '#a78bfa' },
  { key: 'light', label: 'Светлая · голубая', bg: '#eef3f8', dot: '#0ea5e9' },
  { key: 'orange', label: 'Тёмная · оранжевая', bg: '#101010', dot: '#FF8A00' },
  { key: 'red', label: 'Тёмная · красная', bg: '#0d0b0b', dot: '#FF3B30' },
  { key: 'turquoise', label: 'Тёмная · бирюзовая', bg: '#081111', dot: '#00D4C7' },
  { key: 'light-green', label: 'Светлая · зелёная', bg: '#f3faf5', dot: '#34C759' },
  { key: 'gold', label: 'Тёмная · золотая', bg: '#0e0d09', dot: '#D4AF37' },
  { key: 'dark-neon-rain', label: 'Тёмная · неоновый дождь', bg: '#05070d', dot: '#00E5FF' },
];
export const THEME_META_COLOR = {
  lime: '#0a0a0b',
  sky: '#0a0a0b',
  violet: '#0a0a0b',
  light: '#eef3f8',
  orange: '#101010',
  red: '#0d0b0b',
  turquoise: '#081111',
  'light-green': '#f3faf5',
  gold: '#0e0d09',
  'dark-neon-rain': '#05070d',
};
export const normalizeThemeKey = (theme) => {
  const key = theme === 'rain' ? 'dark-neon-rain' : theme;
  return THEMES.some((t) => t.key === key) ? key : 'lime';
};
export const APP_VERSION = '2026.06.30.7';
export const VERSION_FILE_URL = '/version.json';
export const logDev = (...args) => { if (import.meta.env.DEV) console.warn(...args); };
export const TAB_TITLES = {
  diary: 'Дневник',
  progress: 'Прогресс',
  directory: 'База',
  profile: 'Профиль',
  social: 'Друзья и споры',
  settings: 'Настройки',
  about: 'О приложении',
  support: 'Поддержка',
};

export function getUsualSteps(value) {
  const steps = Number(value);
  return Number.isFinite(steps) ? Math.max(0, Math.round(steps)) : DEFAULT_USUAL_STEPS;
}
