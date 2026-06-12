import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matcher } from '../src/reconciliation/matcher.js';
import { SubscriptionUnavailableError } from '../src/shamcash/errors.js';
import { loadConfig } from '../src/config.js';

const baseEnv = {
  SHAMCASH_API_TOKEN: 't',
  SHAMCASH_ACCOUNT_ID: 'acc_1',
  SHOPIFY_SHOP: 's.myshopify.com',
  SHOPIFY_ADMIN_TOKEN: 'shpat_x',
};

class InMemoryStore {
  constructor() {
    this.claims = {};
  }
  claim(txId, info) {
    if (this.claims[txId]) return false;
    this.claims[txId] = info;
    return true;
  }
  orderIdFor(txId) {
    return this.claims[txId]?.orderId ?? null;
  }
  release(txId) {
    delete this.claims[txId];
  }
}

function fakeShopify(orders) {
  return {
    paid: [],
    tagged: [],
    async pendingOrders() {
      return orders;
    },
    async markAsPaid(id) {
      this.paid.push(id);
    },
    async addTags(id, tags) {
      this.tagged.push({ id, tags });
    },
  };
}

function fakeShamcash(transactionsOrError) {
  return {
    async transactions() {
      if (transactionsOrError instanceof Error) throw transactionsOrError;
      return transactionsOrError;
    },
  };
}

function order(overrides = {}) {
  return {
    id: 'gid://shopify/Order/1',
    name: '#1001',
    createdAt: new Date().toISOString(),
    gatewayNames: ['Sham Cash'],
    tags: [],
    amount: '1500.00',
    currency: 'SYP',
    ...overrides,
  };
}

function tx(overrides = {}) {
  return {
    transactionId: 'tx_1',
    amount: '1500.00',
    currencyCode: 'SYP',
    note: 'Order #1001',
    senderName: 'Ali',
    ...overrides,
  };
}

function build({ orders, transactions, env = {} }) {
  const shopify = fakeShopify(orders);
  const matcher = new Matcher({
    config: loadConfig({ ...baseEnv, ...env }),
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    shopify,
    shamcash: fakeShamcash(transactions),
    store: new InMemoryStore(),
  });
  return { matcher, shopify };
}

test('note match marks the order paid and tags it', async () => {
  const { matcher, shopify } = build({ orders: [order()], transactions: [tx()] });
  const summary = await matcher.reconcileAll();
  assert.equal(summary.matched.length, 1);
  assert.equal(summary.matched[0].transactionId, 'tx_1');
  assert.deepEqual(shopify.paid, ['gid://shopify/Order/1']);
  assert.deepEqual(shopify.tagged[0].tags, ['shamcash-tx-tx_1']);
});

test('ignores orders not using the Sham Cash gateway', async () => {
  const { matcher, shopify } = build({
    orders: [order({ gatewayNames: ['Cash on Delivery'] })],
    transactions: [tx()],
  });
  const summary = await matcher.reconcileAll();
  assert.equal(summary.matched.length, 0);
  assert.equal(shopify.paid.length, 0);
});

test('skips orders already tagged as reconciled', async () => {
  const { matcher, shopify } = build({
    orders: [order({ tags: ['shamcash-tx-tx_old'] })],
    transactions: [tx()],
  });
  const summary = await matcher.reconcileAll();
  assert.equal(summary.matched.length, 0);
  assert.equal(shopify.paid.length, 0);
});

test('amount-only mode stays pending when two transfers are ambiguous', async () => {
  const { matcher, shopify } = build({
    orders: [order({ name: '#2002' })],
    transactions: [
      tx({ transactionId: 'a', note: 'no ref' }),
      tx({ transactionId: 'b', note: 'no ref' }),
    ],
    env: { SHAMCASH_MATCH_MODE: 'amount' },
  });
  const summary = await matcher.reconcileAll();
  assert.equal(summary.matched.length, 0);
  assert.equal(summary.pending.length, 1);
  assert.equal(shopify.paid.length, 0);
});

test('a transfer already claimed by another order is not credited twice', async () => {
  const { matcher, shopify } = build({ orders: [order()], transactions: [tx()] });
  matcher.store.claim('tx_1', { orderId: 'gid://shopify/Order/999' });
  const summary = await matcher.reconcileAll();
  assert.equal(summary.matched.length, 0);
  assert.equal(summary.pending.length, 1);
  assert.equal(shopify.paid.length, 0);
});

test('currency mismatch does not match', async () => {
  const { matcher, shopify } = build({
    orders: [order()],
    transactions: [tx({ currencyCode: 'USD' })],
  });
  const summary = await matcher.reconcileAll();
  assert.equal(summary.matched.length, 0);
  assert.equal(shopify.paid.length, 0);
});

test('subscription unavailable aborts the whole run', async () => {
  const { matcher, shopify } = build({
    orders: [order()],
    transactions: new SubscriptionUnavailableError('inactive'),
  });
  const summary = await matcher.reconcileAll();
  assert.equal(summary.aborted, true);
  assert.equal(shopify.paid.length, 0);
});
