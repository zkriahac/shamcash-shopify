import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShamCashClient } from '../src/shamcash/apiClient.js';
import { AuthenticationError } from '../src/shamcash/errors.js';
import { loadConfig } from '../src/config.js';

const envelope = (code, data = [], status = 'success') =>
  JSON.stringify({ status, code, message: code, data });

function fakeHttp(queue) {
  const state = { calls: 0 };
  const http = async () => {
    state.calls += 1;
    const next = queue.shift();
    return { status: next.status, body: next.body, headers: next.headers ?? {} };
  };
  return { http, state };
}

function client(http, { token = 'tok', maxAttempts = 3 } = {}) {
  const config = loadConfig({ SHAMCASH_API_TOKEN: token });
  return new ShamCashClient(config, { http, sleep: async () => {}, maxAttempts });
}

test('transactions returns parsed DTOs', async () => {
  const { http } = fakeHttp([
    { status: 200, body: envelope('SUCCESS', [{ transaction_id: 'tx1', amount: '10', currency: { code: 'SYP' }, note: 'Order #1' }]) },
  ]);
  const txs = await client(http).transactions('acc_1');
  assert.equal(txs.length, 1);
  assert.equal(txs[0].transactionId, 'tx1');
  assert.equal(txs[0].currencyCode, 'SYP');
});

test('retries a retryable failure then succeeds', async () => {
  const { http, state } = fakeHttp([
    { status: 502, body: envelope('FETCH_FAILED', [], 'error') },
    { status: 200, body: envelope('SUCCESS', [{ id: 'acc_1', status: 'active' }]) },
  ]);
  const accounts = await client(http).accounts();
  assert.equal(state.calls, 2);
  assert.equal(accounts.length, 1);
});

test('non-retryable error throws immediately', async () => {
  const { http, state } = fakeHttp([
    { status: 401, body: envelope('AUTH_INVALID', [], 'error') },
    { status: 200, body: envelope('SUCCESS') },
  ]);
  await assert.rejects(() => client(http).accounts(), AuthenticationError);
  assert.equal(state.calls, 1);
});

test('missing token throws before any HTTP call', async () => {
  const { http, state } = fakeHttp([{ status: 200, body: envelope('SUCCESS') }]);
  await assert.rejects(() => client(http, { token: '' }).accounts(), AuthenticationError);
  assert.equal(state.calls, 0);
});
