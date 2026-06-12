/**
 * Parses the Sham Cash response envelope { status, code, message, data } into
 * the `data` payload, or throws the matching typed error.
 * @see https://api.shamcash-api.com/v1
 */

import {
  ApiError,
  AuthenticationError,
  FetchFailedError,
  RateLimitError,
  SubscriptionUnavailableError,
} from './errors.js';

/**
 * @param {{ status: number, body: string, headers?: Record<string,string> }} response
 * @returns {any} The `data` field on success.
 */
export function parseEnvelope(response) {
  let decoded;
  try {
    decoded = JSON.parse(response.body);
  } catch {
    decoded = null;
  }

  if (!decoded || typeof decoded !== 'object' || decoded.status === undefined) {
    if (response.status >= 500 || response.status === 0) {
      throw new FetchFailedError(
        `The Sham Cash API returned an unreadable response (HTTP ${response.status}).`,
      );
    }
    throw new ApiError(
      `The Sham Cash API returned an unexpected response (HTTP ${response.status}).`,
      'INTERNAL_ERROR',
    );
  }

  const code = String(decoded.code ?? 'INTERNAL_ERROR');
  const message = String(decoded.message ?? '');

  if (decoded.status === 'success' && code === 'SUCCESS') {
    return decoded.data ?? [];
  }

  throw toError(code, message, response);
}

/**
 * @param {string} code
 * @param {string} message
 * @param {{ headers?: Record<string,string> }} response
 * @returns {ApiError}
 */
function toError(code, message, response) {
  const text = message !== '' ? message : `Sham Cash API error: ${code}`;
  switch (code) {
    case 'AUTH_MISSING':
    case 'AUTH_INVALID':
    case 'FORBIDDEN':
      return new AuthenticationError(text, code);
    case 'SUBSCRIPTION_UNAVAILABLE':
      return new SubscriptionUnavailableError(text);
    case 'RATE_LIMIT_EXCEEDED':
      return new RateLimitError(text, retryAfter(response));
    case 'FETCH_FAILED':
      return new FetchFailedError(text);
    default:
      return new ApiError(text, code);
  }
}

/**
 * @param {{ headers?: Record<string,string> }} response
 * @returns {number|null}
 */
function retryAfter(response) {
  const value = response.headers?.['retry-after'];
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return null;
  }
  return Math.max(0, parseInt(value, 10));
}
