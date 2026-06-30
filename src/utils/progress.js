import { getLocalDateString } from './date.js';

const progressPeriods = [
  { key: '7d', label: '1 неделя', days: 7 },
  { key: '14d', label: '2 недели', days: 14 },
  { key: '21d', label: '3 недели', days: 21 },
  { key: '30d', label: '30 дней', days: 30 },
  { key: '45d', label: '45 дней', days: 45 },
  { key: '60d', label: '60 дней', days: 60 },
  { key: '90d', label: '90 дней', days: 90 },
  { key: '180d', label: '180 дней', days: 180 },
  { key: 'all', label: 'Весь период', days: null },
];

const roundOne = (value) => Math.round(value * 10) / 10;

const getProgressPeriod = (key) => (
  progressPeriods.find((period) => period.key === key) || progressPeriods[progressPeriods.length - 1]
);

const shiftDateString = (dateString, diffDays) => {
  const [year, month, day] = String(dateString).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + diffDays);
  return getLocalDateString(date);
};

const filterDatesByProgressPeriod = (dates, periodKey, today = getLocalDateString(new Date())) => {
  const sorted = [...(dates || [])].filter(Boolean).sort();
  const period = getProgressPeriod(periodKey);
  if (!period.days) return sorted;
  const start = shiftDateString(today, -(period.days - 1));
  return sorted.filter((date) => date >= start && date <= today);
};

const filterProgressPointsByPeriod = (
  points,
  periodKey,
  today = getLocalDateString(new Date()),
  getDate = (point) => point?.d || point?.date,
) => {
  const allowedDates = new Set(filterDatesByProgressPeriod((points || []).map(getDate), periodKey, today));
  return [...(points || [])]
    .filter((point) => allowedDates.has(getDate(point)))
    .sort((a, b) => String(getDate(a)).localeCompare(String(getDate(b))));
};

const normalizeWeightHistory = (history) => {
  const byDate = new Map();
  (history || []).forEach((point) => {
    const date = point?.d || point?.date;
    const rawValue = point?.v ?? point?.value ?? point?.weight;
    const value = Number(rawValue);
    if (!date || !Number.isFinite(value) || value <= 0) return;
    byDate.set(date, { d: date, v: roundOne(value) });
  });
  return [...byDate.values()].sort((a, b) => a.d.localeCompare(b.d));
};

const summarizeWeightProgress = ({
  history,
  periodKey,
  today = getLocalDateString(new Date()),
  emptyMessage = 'Записей прогресса пока нет',
}) => {
  const normalized = normalizeWeightHistory(history);
  const filteredHistory = filterProgressPointsByPeriod(normalized, periodKey, today);
  const latest = normalized[normalized.length - 1] || null;
  const first = filteredHistory[0] || null;
  const last = filteredHistory[filteredHistory.length - 1] || null;
  const best = filteredHistory.length
    ? filteredHistory.reduce((min, point) => (point.v < min.v ? point : min), filteredHistory[0])
    : null;
  const delta = first && last && filteredHistory.length >= 2 ? roundOne(last.v - first.v) : null;
  const loss = delta == null ? null : roundOne(-delta);
  const percent = first && delta != null ? roundOne((delta / first.v) * 100) : null;

  let status = emptyMessage;
  if (filteredHistory.length >= 2) status = 'Данные есть';
  else if (filteredHistory.length === 1) status = 'Нужна ещё одна запись';

  return {
    allHistory: normalized,
    filteredHistory,
    currentWeight: latest?.v ?? null,
    count: filteredHistory.length,
    bestWeight: best?.v ?? null,
    firstWeight: first?.v ?? null,
    lastWeight: last?.v ?? null,
    delta,
    loss,
    percent,
    status,
    hasData: filteredHistory.length > 0,
    hasComparableData: filteredHistory.length >= 2 && delta != null,
  };
};

const compareWeightLoss = (mine, friend, periodLabel) => {
  if (!mine?.hasComparableData || !friend?.hasComparableData) {
    return { status: 'insufficient', text: 'Недостаточно данных для сравнения' };
  }

  const diff = roundOne(Math.abs(mine.loss - friend.loss));
  const periodText = String(periodLabel || '').toLowerCase();
  if (diff < 0.1) return { status: 'tie', text: `Пока ничья за ${periodText}` };
  if (mine.loss > friend.loss) return { status: 'me', text: `Вы впереди на ${diff} кг за ${periodText}` };
  return { status: 'friend', text: `Друг впереди на ${diff} кг за ${periodText}` };
};

export {
  compareWeightLoss,
  filterDatesByProgressPeriod,
  filterProgressPointsByPeriod,
  getProgressPeriod,
  normalizeWeightHistory,
  progressPeriods,
  summarizeWeightProgress,
};
