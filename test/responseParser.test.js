import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvelope } from '../src/shamcash/responseParser.js';
import {
  ApiError,
  AuthenticationError,
  FetchFailedError,
  RateLimitError,
  SubscriptionUnavailableError,
} from '../src/shamcash/errors.js';

const res = (body, status = 200, headers = {}) => ({
  status,
  body: typeof body === 'string' ? body : JSON.stringify(body),
  headers,
});

test('returns data on success envelope', () => {
  const data = parseEnvelope(
    res({ status: 'success', code: 'SUCCESS', message: 'ok', data: [{ id: 'a' }] }),
  );
  assert.deepEqual(data, [{ id: 'a' }]);
});

test('maps AUTH_INVALID to AuthenticationError', () => {
  assert.throws(
    () => parseEnvelope(res({ status: 'error', code: 'AUTH_INVALID', data: null }, 401)),
    AuthenticationError,
  );
});

test('maps SUBSCRIPTION_UNAVAILABLE', () => {
  assert.throws(
    () => parseEnvelope(res({ status: 'error', code: 'SUBSCRIPTION_UNAVAILABLE', data: null }, 403)),
    SubscriptionUnavailableError,
  );
});

test('rate limit captures retry-after and is retryable', () => {
  try {
    parseEnvelope(
      res({ status: 'error', code: 'RATE_LIMIT_EXCEEDED', data: null }, 429, { 'retry-after': '7' }),
    );
    assert.fail('should throw');
  } catch (err) {
    assert.ok(err instanceof RateLimitError);
    assert.equal(err.retryAfter, 7);
    assert.equal(err.retryable, true);
  }
});

test('FETCH_FAILED is retryable', () => {
  try {
    parseEnvelope(res({ status: 'error', code: 'FETCH_FAILED', data: null }, 502));
    assert.fail('should throw');
  } catch (err) {
    assert.ok(err instanceof FetchFailedError);
    assert.equal(err.retryable, true);
  }
});

test('validation error is generic and not retryable', () => {
  try {
    parseEnvelope(res({ status: 'error', code: 'VALIDATION_ERROR', message: 'bad', data: null }, 400));
    assert.fail('should throw');
  } catch (err) {
    assert.ok(err instanceof ApiError);
    assert.equal(err.apiCode, 'VALIDATION_ERROR');
    assert.equal(err.retryable, false);
  }
});

test('unreadable 5xx body is retryable fetch failure', () => {
  assert.throws(() => parseEnvelope(res('<html>down</html>', 503)), FetchFailedError);
});
