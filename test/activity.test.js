import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EXTRA_ACTIVITY_TYPES,
  calculateDailyAvailableCalories,
  normalizeExtraActivities,
  sumExtraActivityCalories,
  validateExtraActivityCalories,
} from '../src/utils/activity.js';

test('extra activity presets provide editable calorie suggestions', () => {
  const byKey = Object.fromEntries(EXTRA_ACTIVITY_TYPES.map((activity) => [activity.key, activity]));

  assert.equal(byKey.football.defaultCalories, 400);
  assert.equal(byKey.snowboard.defaultCalories, 350);
  assert.equal(byKey.strength.defaultCalories, 250);
  assert.equal(byKey.other.defaultCalories, '');
});

test('extra activities increase only daily available calories', () => {
  const activities = [
    { id: 'a1', type: 'football', name: 'Футбол', calories: 400 },
    { id: 'a2', type: 'snowboard', name: 'Сноуборд', calories: 350 },
  ];

  assert.equal(sumExtraActivityCalories(activities), 750);
  assert.equal(calculateDailyAvailableCalories(1800, activities), 2550);
});

test('normalizes malformed extra activities safely', () => {
  assert.deepEqual(
    normalizeExtraActivities([
      { id: 'ok', type: 'football', calories: '400' },
      { id: 'bad-zero', type: 'run', calories: 0 },
      { type: 'walk', calories: 200 },
    ]),
    [{ id: 'ok', type: 'football', name: 'Футбол', calories: 400, createdAt: '', updatedAt: '' }],
  );
});

test('validates extra activity calories with clear messages', () => {
  assert.deepEqual(validateExtraActivityCalories(''), {
    ok: false,
    value: null,
    error: 'Введите количество калорий',
    warning: '',
  });
  assert.deepEqual(validateExtraActivityCalories('0'), {
    ok: false,
    value: 0,
    error: 'Калории должны быть больше 0',
    warning: '',
  });
  assert.deepEqual(validateExtraActivityCalories('-10'), {
    ok: false,
    value: -10,
    error: 'Калории не могут быть отрицательными',
    warning: '',
  });
  assert.deepEqual(validateExtraActivityCalories('3500'), {
    ok: true,
    value: 3500,
    error: '',
    warning: 'Проверьте значение. Это очень большой расход за одну активность.',
  });
});
