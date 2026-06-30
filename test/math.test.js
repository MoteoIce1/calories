import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateMath } from '../src/utils/math.js';

test('evaluates simple arithmetic for food and body inputs', () => {
  assert.equal(evaluateMath('100+50'), 150);
  assert.equal(evaluateMath('200-25*2'), 150);
  assert.equal(evaluateMath('(100 + 50) / 3'), 50);
  assert.equal(evaluateMath('100,5 + 0,2'), 100.7);
});

test('keeps invalid, negative, and non-finite math safe', () => {
  assert.equal(evaluateMath('10 / 0'), 0);
  assert.equal(evaluateMath('50 - 100'), 0);
  assert.equal(evaluateMath('alert(1)'), 0);
  assert.equal(evaluateMath('10..2'), 0);
});
