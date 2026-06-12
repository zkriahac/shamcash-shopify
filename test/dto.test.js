import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAccount, parseBalance, parseTransaction } from '../src/shamcash/dto.js';

test('parseTransaction handles nested currency and sender', () => {
  const tx = parseTransaction({
    transaction_id: 'tx_9',
    amount: '1500.00',
    currency: { code: 'syp' },
    note: 'Order #1001',
    sender_name: 'Ali',
  });
  assert.equal(tx.transactionId, 'tx_9');
  assert.equal(tx.currencyCode, 'SYP');
  assert.equal(tx.note, 'Order #1001');
  assert.equal(tx.senderName, 'Ali');
});

test('parseTransaction falls back to id and flat currency_code', () => {
  const tx = parseTransaction({ id: 'flat', amount: '10', currency_code: 'usd' });
  assert.equal(tx.transactionId, 'flat');
  assert.equal(tx.currencyCode, 'USD');
  assert.equal(tx.note, null);
});

test('parseBalance', () => {
  const b = parseBalance({ currency: { code: 'TRY' }, available: '42.5', blocked: '1' });
  assert.equal(b.currencyCode, 'TRY');
  assert.equal(b.available, '42.5');
});

test('parseAccount derives isActive', () => {
  const a = parseAccount({ id: 'acc_1', status: 'active', address: 'SC-1', qr_payload: 'qr' });
  assert.equal(a.isActive, true);
  assert.equal(a.address, 'SC-1');
  assert.equal(parseAccount({ id: 'x', status: 'inactive' }).isActive, false);
});
