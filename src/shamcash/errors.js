/**
 * Typed errors for Sham Cash API failures.
 *
 * Mirrors the exception hierarchy used in the Magento and WooCommerce modules
 * so the matching logic behaves identically across platforms.
 * @see https://api.shamcash-api.com/v1
 */

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {string} [apiCode]
   * @param {{ retryable?: boolean, retryAfter?: number|null, cause?: unknown }} [options]
   */
  constructor(message, apiCode = 'INTERNAL_ERROR', options = {}) {
    super(message);
    this.name = 'ApiError';
    this.apiCode = apiCode;
    this.retryable = options.retryable ?? false;
    this.retryAfter = options.retryAfter ?? null;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export class AuthenticationError extends ApiError {
  constructor(message, apiCode = 'AUTH_INVALID') {
    super(message, apiCode, { retryable: false });
    this.name = 'AuthenticationError';
  }
}

export class SubscriptionUnavailableError extends ApiError {
  constructor(message) {
    super(message, 'SUBSCRIPTION_UNAVAILABLE', { retryable: false });
    this.name = 'SubscriptionUnavailableError';
  }
}

export class RateLimitError extends ApiError {
  /** @param {string} message @param {number|null} [retryAfter] */
  constructor(message, retryAfter = null) {
    super(message, 'RATE_LIMIT_EXCEEDED', { retryable: true, retryAfter });
    this.name = 'RateLimitError';
  }
}

export class FetchFailedError extends ApiError {
  constructor(message, options = {}) {
    super(message, 'FETCH_FAILED', { retryable: true, cause: options.cause });
    this.name = 'FetchFailedError';
  }
}
