/**
 * Client for the read-only Sham Cash API (accounts, balances, transactions),
 * with bounded retry/backoff for transient failures honoring Retry-After.
 * @see https://api.shamcash-api.com/v1
 */

import { ApiError, AuthenticationError } from './errors.js';
import { parseAccount, parseBalance, parseTransaction } from './dto.js';
import { parseEnvelope } from './responseParser.js';

const BACKOFF_BASE_MS = 1000;
const MAX_BACKOFF_MS = 8000;

/**
 * Default fetch-based transport.
 * @param {string} url
 * @param {Record<string,string>} headers
 * @returns {Promise<{ status: number, body: string, headers: Record<string,string> }>}
 */
async function defaultHttp(url, headers) {
  const res = await fetch(url, { method: 'GET', headers });
  const lowered = {};
  res.headers.forEach((v, k) => {
    lowered[k.toLowerCase()] = v;
  });
  return { status: res.status, body: await res.text(), headers: lowered };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class ShamCashClient {
  /**
   * @param {import('../config.js').Config} config
   * @param {{ http?: typeof defaultHttp, sleep?: (ms:number)=>Promise<void>, maxAttempts?: number, logger?: Console }} [deps]
   */
  constructor(config, deps = {}) {
    this.config = config;
    this.http = deps.http ?? defaultHttp;
    this.sleep = deps.sleep ?? sleep;
    this.maxAttempts = deps.maxAttempts ?? 3;
    this.logger = deps.logger ?? null;
  }

  /** @returns {Promise<ReturnType<typeof parseAccount>[]>} */
  async accounts() {
    return this.#rows(await this.#get('/accounts', {})).map(parseAccount);
  }

  /** @param {string} accountId */
  async balances(accountId) {
    return this.#rows(await this.#get('/balances', { account_id: accountId })).map(parseBalance);
  }

  /**
   * @param {string} accountId
   * @param {Record<string, string|number|null|undefined>} [filters]
   * @returns {Promise<ReturnType<typeof parseTransaction>[]>}
   */
  async transactions(accountId, filters = {}) {
    const query = { account_id: accountId };
    for (const [key, value] of Object.entries(filters)) {
      if (value !== null && value !== undefined && value !== '') {
        query[key] = value;
      }
    }
    return this.#rows(await this.#get('/transactions', query)).map(parseTransaction);
  }

  /**
   * @param {string} path
   * @param {Record<string, string|number>} query
   */
  async #get(path, query) {
    const token = this.config.shamcash.token;
    if (!token) {
      throw new AuthenticationError('No Sham Cash API token is configured.', 'AUTH_MISSING');
    }

    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])),
    ).toString();
    const url = this.config.shamcash.baseUrl + path + (qs ? `?${qs}` : '');
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

    let lastError = null;
    for (let attempt = 1; attempt <= Math.max(1, this.maxAttempts); attempt++) {
      try {
        const data = parseEnvelope(await this.http(url, headers));
        this.logger?.debug?.(`GET ${path} -> success (attempt ${attempt})`);
        return data;
      } catch (err) {
        if (!(err instanceof ApiError)) {
          // Transport-level failure (e.g. network) — treat as retryable.
          lastError = err;
          if (attempt >= this.maxAttempts) throw err;
          await this.sleep(this.#backoff(attempt, null));
          continue;
        }
        lastError = err;
        if (!err.retryable || attempt >= this.maxAttempts) {
          throw err;
        }
        await this.sleep(this.#backoff(attempt, err.retryAfter));
      }
    }
    throw lastError ?? new ApiError('Sham Cash request failed.');
  }

  /**
   * @param {number} attempt
   * @param {number|null} retryAfter
   */
  #backoff(attempt, retryAfter) {
    let ms = BACKOFF_BASE_MS * 2 ** (attempt - 1);
    if (retryAfter !== null && retryAfter !== undefined) {
      ms = retryAfter * 1000;
    }
    return Math.min(ms, MAX_BACKOFF_MS);
  }

  /**
   * @param {any} data
   * @returns {Record<string, any>[]}
   */
  #rows(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data.filter((row) => row && typeof row === 'object');
    return [data];
  }
}
