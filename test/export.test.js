import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildDietCsv } from '../src/utils/export.js';

test('builds diet CSV with workout, water, metrics, and step-adjusted burn', () => {
  const csv = buildDietCsv({
    dates: ['2026-06-29'],
    getGoalsForDate: () => ({ baseSteps: 2000, maintenance: 2300 }),
    dailyLogs: {
      '2026-06-29': [
        { totalCalories: 500, totalProtein: 31.2, totalFats: 12.4, totalCarbs: 49.9 },
        { totalCalories: 250, totalProtein: 10, totalFats: 6, totalCarbs: 32 },
      ],
    },
    dailySteps: { '2026-06-29': 7000 },
    dailyMetrics: {
      '2026-06-29': { weight: 80.5, fatPercent: 18.2, leanMass: 65.8, fatMass: 14.7 },
    },
    dailyWorkouts: { '2026-06-29': true },
    dailyWater: { '2026-06-29': 1800 },
  });

  const lines = csv.replace(/^\uFEFF/, '').split('\n');

  assert.equal(lines[0], 'Дата;Ккал;Белок;Жиры;Углеводы;Шаги;Расход;Дефицит;Тренировка;Вода (мл);Вес;Жир %;БЖМ;Масса жира');
  assert.equal(lines[1], '2026-06-29;750;41;18;82;7000;2500;1750;да;1800;80,5;18,2;65,8;14,7');
});
