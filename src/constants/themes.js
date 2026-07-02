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
