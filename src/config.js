/**
 * Environment-driven configuration. Pure: accepts an env object so it can be
 * unit-tested without touching process.env.
 */

export const MATCH_MODE_NOTE = 'note';
export const MATCH_MODE_AMOUNT = 'amount';
export const MATCH_MODE_BOTH = 'both';

/**
 * @typedef {ReturnType<typeof loadConfig>} Config
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function loadConfig(env = process.env) {
  const str = (key, fallback = '') => (env[key] != null ? String(env[key]).trim() : fallback);
  const int = (key, fallback) => {
    const value = parseInt(str(key), 10);
    return Number.isNaN(value) ? fallback : value;
  };

  const mode = str('SHAMCASH_MATCH_MODE', MATCH_MODE_BOTH);

  return {
    shamcash: {
      baseUrl: (str('SHAMCASH_API_BASE', 'https://api.shamcash-api.com/v1')).replace(/\/+$/, ''),
      token: str('SHAMCASH_API_TOKEN'),
      accountId: str('SHAMCASH_ACCOUNT_ID'),
    },
    shopify: {
      shop: str('SHOPIFY_SHOP'),
      adminToken: str('SHOPIFY_ADMIN_TOKEN'),
      apiVersion: str('SHOPIFY_API_VERSION', '2024-10'),
    },
    matching: {
      mode: [MATCH_MODE_NOTE, MATCH_MODE_AMOUNT, MATCH_MODE_BOTH].includes(mode)
        ? mode
        : MATCH_MODE_BOTH,
      tolerance: str('SHAMCASH_AMOUNT_TOLERANCE', '0'),
      allowedCurrencies: parseList(str('SHAMCASH_ALLOWED_CURRENCIES', 'SYP,USD,TRY')),
      coinMap: parseCoinMap(str('SHAMCASH_COIN_MAP')),
      graceMinutes: Math.max(0, int('SHAMCASH_TIME_WINDOW_GRACE', 30)),
      orderMaxAgeMinutes: Math.max(1, int('SHAMCASH_ORDER_MAX_AGE', 1440)),
      // The name of the Shopify manual payment method to reconcile.
      gatewayName: str('SHAMCASH_GATEWAY_NAME', 'Sham Cash'),
    },
    store: {
      ledgerPath: str('SHAMCASH_LEDGER_PATH', './data/claims.json'),
    },
    poll: {
      intervalMs: Math.max(30, int('SHAMCASH_POLL_INTERVAL_SECONDS', 300)) * 1000,
    },
    debug: ['1', 'true', 'yes'].includes(str('SHAMCASH_DEBUG').toLowerCase()),
  };
}

/**
 * @param {Config} config
 * @param {string} currencyCode
 * @returns {string|null}
 */
export function coinId(config, currencyCode) {
  return config.matching.coinMap[String(currencyCode).toUpperCase()] ?? null;
}

/**
 * @param {Config} config
 * @param {string} currencyCode
 */
export function isCurrencyAllowed(config, currencyCode) {
  return config.matching.allowedCurrencies.includes(String(currencyCode).toUpperCase());
}

/**
 * Throws if required credentials are missing.
 * @param {Config} config
 */
export function assertConfigured(config) {
  const missing = [];
  if (!config.shamcash.token) missing.push('SHAMCASH_API_TOKEN');
  if (!config.shamcash.accountId) missing.push('SHAMCASH_ACCOUNT_ID');
  if (!config.shopify.shop) missing.push('SHOPIFY_SHOP');
  if (!config.shopify.adminToken) missing.push('SHOPIFY_ADMIN_TOKEN');
  if (missing.length) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
}

/** @param {string} value */
function parseList(value) {
  return value
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Parse "SYP:1, USD:2\nTRY:3" into { SYP: '1', USD: '2', TRY: '3' }.
 * @param {string} value
 * @returns {Record<string,string>}
 */
function parseCoinMap(value) {
  /** @type {Record<string,string>} */
  const map = {};
  for (const pair of value.split(/[,\n]/)) {
    const [code, id] = pair.split(':');
    if (code && id && code.trim() && id.trim()) {
      map[code.trim().toUpperCase()] = id.trim();
    }
  }
  return map;
}
