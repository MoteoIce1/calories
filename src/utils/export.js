import { calculateStepCalorieAdjustment } from './kbju.js';

const CSV_SEPARATOR = ';';
const CSV_HEADERS = [
  'Дата',
  'Ккал',
  'Белок',
  'Жиры',
  'Углеводы',
  'Шаги',
  'Расход',
  'Дефицит',
  'Тренировка',
  'Вода (мл)',
  'Вес',
  'Жир %',
  'БЖМ',
  'Масса жира',
];

function formatCsvValue(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value).replace('.', ',') : '';
  return String(value).replaceAll('"', '""');
}

function getUsualSteps(value, fallback = 2000) {
  const steps = Number(value);
  return Number.isFinite(steps) ? Math.max(0, Math.round(steps)) : fallback;
}

function buildDietCsv({
  dates,
  getGoalsForDate,
  dailyLogs = {},
  dailySteps = {},
  dailyMetrics = {},
  dailyWorkouts = {},
  dailyWater = {},
}) {
  const rows = [CSV_HEADERS.join(CSV_SEPARATOR)];

  dates.forEach((date) => {
    const goals = getGoalsForDate(date);
    const baseSteps = getUsualSteps(goals?.baseSteps);
    const baseMaintenance = Number(goals?.maintenance) || 2300;
    const logs = dailyLogs[date] || [];
    const calories = logs.reduce((sum, log) => sum + (log.totalCalories || 0), 0);
    const protein = Math.round(logs.reduce((sum, log) => sum + (log.totalProtein || 0), 0));
    const fats = Math.round(logs.reduce((sum, log) => sum + (log.totalFats || 0), 0));
    const carbs = Math.round(logs.reduce((sum, log) => sum + (log.totalCarbs || 0), 0));
    const rawSteps = dailySteps[date] !== undefined ? dailySteps[date] : '';
    const stepsForBurn = dailySteps[date] !== undefined ? dailySteps[date] : baseSteps;
    const burned = baseMaintenance + calculateStepCalorieAdjustment(stepsForBurn, baseSteps);
    const metrics = dailyMetrics[date] || {};

    const values = [
      date,
      calories,
      protein,
      fats,
      carbs,
      rawSteps,
      burned,
      burned - calories,
      dailyWorkouts[date] ? 'да' : '',
      dailyWater[date],
      metrics.weight,
      metrics.fatPercent,
      metrics.leanMass,
      metrics.fatMass,
    ];
    rows.push(values.map(formatCsvValue).join(CSV_SEPARATOR));
  });

  return `\uFEFF${rows.join('\n')}`;
}

export { buildDietCsv, formatCsvValue };
