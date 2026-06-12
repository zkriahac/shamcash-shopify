import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amountWithinTolerance,
  currencyMatches,
  noteMatches,
  normalize,
  referenceCandidates,
  toScaledInt,
} from '../src/reconciliation/matchRules.js';

test('referenceCandidates strips leading # and zeros', () => {
  assert.deepEqual(referenceCandidates('#001023'), ['001023', '1023']);
  assert.deepEqual(referenceCandidates('1001'), ['1001']);
});

test('noteMatches is case-insensitive substring', () => {
  const refs = referenceCandidates('#001023');
  assert.equal(noteMatches('Payment for ORDER 001023', refs), true);
  assert.equal(noteMatches('paying 1023 now', refs), true);
  assert.equal(noteMatches('order 9999', refs), false);
  assert.equal(noteMatches(null, refs), false);
});

test('currencyMatches ignores case and whitespace', () => {
  assert.equal(currencyMatches(' syp ', 'SYP'), true);
  assert.equal(currencyMatches('USD', 'syp'), false);
});

test('amountWithinTolerance respects boundaries', () => {
  assert.equal(amountWithinTolerance('100.50', '100.00', '0.50'), true);
  assert.equal(amountWithinTolerance('100.51', '100.00', '0.50'), false);
});

test('amount comparison is exact for very large SYP values', () => {
  assert.equal(amountWithinTolerance('250000000.0000', '250000000', '0'), true);
  assert.equal(amountWithinTolerance('250000000.0001', '250000000', '0'), false);
  // far beyond Number.MAX_SAFE_INTEGER when scaled — BigInt keeps it exact
  assert.equal(amountWithinTolerance('9007199254740993', '9007199254740992', '0'), false);
});

test('normalize yields four decimals', () => {
  assert.equal(normalize('123.4'), '123.4000');
  assert.equal(normalize('1500'), '1500.0000');
  assert.equal(normalize(''), '0.0000');
});

test('toScaledInt returns bigint scaled by 1e4', () => {
  assert.equal(toScaledInt('1.2345'), 12345n);
  assert.equal(toScaledInt('-0.5'), -5000n);
});
