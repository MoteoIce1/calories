import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  compareWeightLoss,
  filterDatesByProgressPeriod,
  progressPeriods,
  summarizeWeightProgress,
} from '../src/utils/progress.js';

test('progress periods use the required order and do not include 15 days', () => {
  assert.deepEqual(
    progressPeriods.map((period) => period.label),
    ['1 неделя', '2 недели', '3 недели', '30 дней', '45 дней', '60 дней', '90 дней', '180 дней', 'Весь период'],
  );
  assert.equal(progressPeriods.some((period) => period.days === 15 || period.key === '15d'), false);
});

test('filters progress dates backwards from today with inclusive day count', () => {
  const dates = ['2026-06-09', '2026-06-10', '2026-06-16', '2026-06-17', '2026-06-23', '2026-06-30'];

  assert.deepEqual(filterDatesByProgressPeriod(dates, '7d', '2026-06-30'), ['2026-06-30']);
  assert.deepEqual(filterDatesByProgressPeriod(dates, '14d', '2026-06-30'), ['2026-06-17', '2026-06-23', '2026-06-30']);
  assert.deepEqual(filterDatesByProgressPeriod(dates, '21d', '2026-06-30'), ['2026-06-10', '2026-06-16', '2026-06-17', '2026-06-23', '2026-06-30']);
  assert.deepEqual(filterDatesByProgressPeriod(dates, 'all', '2026-06-30'), dates);
});

test('summarizes weight progress and compares fair weight loss', () => {
  const mine = summarizeWeightProgress({
    periodKey: '14d',
    today: '2026-06-30',
    history: [
      { d: '2026-06-17', v: 81 },
      { d: '2026-06-23', v: 80.5 },
      { d: '2026-06-30', v: 79.6 },
    ],
  });
  const friend = summarizeWeightProgress({
    periodKey: '14d',
    today: '2026-06-30',
    history: [
      { d: '2026-06-17', v: 90 },
      { d: '2026-06-30', v: 89.2 },
    ],
  });

  assert.equal(mine.currentWeight, 79.6);
  assert.equal(mine.delta, -1.4);
  assert.equal(mine.loss, 1.4);
  assert.equal(mine.count, 3);
  assert.equal(mine.bestWeight, 79.6);
  assert.deepEqual(compareWeightLoss(mine, friend, '2 недели'), {
    status: 'me',
    text: 'Вы впереди на 0.6 кг за 2 недели',
  });
});
