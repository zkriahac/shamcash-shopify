import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MATCH_MODE_BOTH,
  MATCH_MODE_NOTE,
  assertConfigured,
  coinId,
  isCurrencyAllowed,
  loadConfig,
} from '../src/config.js';

test('defaults are sensible', () => {
  const c = loadConfig({});
  assert.equal(c.shamcash.baseUrl, 'https://api.shamcash-api.com/v1');
  assert.deepEqual(c.matching.allowedCurrencies, ['SYP', 'USD', 'TRY']);
  assert.equal(c.matching.mode, MATCH_MODE_BOTH);
  assert.equal(c.matching.gatewayName, 'Sham Cash');
});

test('base url trailing slash is trimmed', () => {
  assert.equal(loadConfig({ SHAMCASH_API_BASE: 'https://x.test/v1/' }).shamcash.baseUrl, 'https://x.test/v1');
});

test('coin map parses comma and newline', () => {
  const c = loadConfig({ SHAMCASH_COIN_MAP: 'SYP:1, USD:2\nTRY:3' });
  assert.equal(coinId(c, 'syp'), '1');
  assert.equal(coinId(c, 'USD'), '2');
  assert.equal(coinId(c, 'EUR'), null);
});

test('allowed currencies custom + check', () => {
  const c = loadConfig({ SHAMCASH_ALLOWED_CURRENCIES: 'syp, eur' });
  assert.deepEqual(c.matching.allowedCurrencies, ['SYP', 'EUR']);
  assert.equal(isCurrencyAllowed(c, 'EUR'), true);
  assert.equal(isCurrencyAllowed(c, 'USD'), false);
});

test('invalid match mode falls back to both', () => {
  assert.equal(loadConfig({ SHAMCASH_MATCH_MODE: 'garbage' }).matching.mode, MATCH_MODE_BOTH);
  assert.equal(loadConfig({ SHAMCASH_MATCH_MODE: 'note' }).matching.mode, MATCH_MODE_NOTE);
});

test('assertConfigured lists every missing credential', () => {
  assert.throws(() => assertConfigured(loadConfig({})), /SHAMCASH_API_TOKEN.*SHAMCASH_ACCOUNT_ID.*SHOPIFY_SHOP.*SHOPIFY_ADMIN_TOKEN/);
  assert.doesNotThrow(() =>
    assertConfigured(
      loadConfig({
        SHAMCASH_API_TOKEN: 't',
        SHAMCASH_ACCOUNT_ID: 'a',
        SHOPIFY_SHOP: 's.myshopify.com',
        SHOPIFY_ADMIN_TOKEN: 'shpat_x',
      }),
    ),
  );
});

test('poll interval has a floor and converts to ms', () => {
  assert.equal(loadConfig({ SHAMCASH_POLL_INTERVAL_SECONDS: '5' }).poll.intervalMs, 30_000);
  assert.equal(loadConfig({ SHAMCASH_POLL_INTERVAL_SECONDS: '600' }).poll.intervalMs, 600_000);
});
