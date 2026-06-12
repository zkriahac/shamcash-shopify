/**
 * Normalizers for Sham Cash API objects (accounts, balances, transactions).
 *
 * The API nests currency as `{ code }` but some payloads use a flat
 * `currency_code`; these helpers accept either, exactly like the PHP DTOs.
 * @see https://api.shamcash-api.com/v1
 */

/**
 * @param {Record<string, any>} row
 * @returns {string}
 */
function currencyCode(row) {
  const currency = row.currency;
  const code =
    currency && typeof currency === 'object'
      ? currency.code
      : row.currency_code ?? currency ?? '';
  return String(code ?? '').toUpperCase();
}

/**
 * @typedef {Object} Transaction
 * @property {string} transactionId
 * @property {string} amount
 * @property {string} currencyCode
 * @property {string|null} occurredAt
 * @property {string|null} senderName
 * @property {string|null} senderAddress
 * @property {string|null} receiverName
 * @property {string|null} note
 */

/**
 * @param {Record<string, any>} row
 * @returns {Transaction}
 */
export function parseTransaction(row) {
  return {
    transactionId: String(row.transaction_id ?? row.id ?? ''),
    amount: String(row.amount ?? '0'),
    currencyCode: currencyCode(row),
    occurredAt: row.occurred_at != null ? String(row.occurred_at) : null,
    senderName: row.sender_name != null ? String(row.sender_name) : null,
    senderAddress: row.sender_address != null ? String(row.sender_address) : null,
    receiverName: row.receiver_name != null ? String(row.receiver_name) : null,
    note: row.note != null ? String(row.note) : null,
  };
}

/**
 * @param {Record<string, any>} row
 */
export function parseBalance(row) {
  return {
    currencyCode: currencyCode(row),
    available: String(row.available ?? '0'),
    blocked: String(row.blocked ?? '0'),
  };
}

/**
 * @param {Record<string, any>} row
 */
export function parseAccount(row) {
  const status = String(row.status ?? 'inactive');
  return {
    id: String(row.id ?? ''),
    name: row.name != null ? String(row.name) : null,
    email: row.email != null ? String(row.email) : null,
    phone: row.phone != null ? String(row.phone) : null,
    status,
    isActive: status.toLowerCase() === 'active',
    subscriptionExpiresAt:
      row.subscription_expires_at != null ? String(row.subscription_expires_at) : null,
    address: row.address != null ? String(row.address) : null,
    qrPayload: row.qr_payload != null ? String(row.qr_payload) : null,
  };
}
