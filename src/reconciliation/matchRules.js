/**
 * Pure matching rules shared with the Magento/WooCommerce implementations.
 *
 * Amounts are compared as fixed-point integers scaled to 4 decimals using
 * BigInt, so large SYP values compare exactly with no floating-point error.
 */

const SCALE = 4;

/**
 * @param {string} orderReference
 * @returns {string[]}
 */
export function referenceCandidates(orderReference) {
  const ref = String(orderReference).replace(/^#/, '');
  const candidates = [ref];
  const trimmed = ref.replace(/^0+/, '');
  if (trimmed !== '' && trimmed !== ref) {
    candidates.push(trimmed);
  }
  return [...new Set(candidates.filter((c) => c !== ''))];
}

/**
 * @param {string|null|undefined} note
 * @param {string[]} references
 * @returns {boolean}
 */
export function noteMatches(note, references) {
  if (note === null || note === undefined || String(note).trim() === '') {
    return false;
  }
  const haystack = String(note).toLowerCase();
  return references.some((ref) => ref !== '' && haystack.includes(ref.toLowerCase()));
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function currencyMatches(a, b) {
  return String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
}

/**
 * @param {string} actual
 * @param {string} expected
 * @param {string} tolerance
 * @returns {boolean}
 */
export function amountWithinTolerance(actual, expected, tolerance) {
  const diff = toScaledInt(actual) - toScaledInt(expected);
  const abs = diff < 0n ? -diff : diff;
  const tol = toScaledInt(tolerance);
  const absTol = tol < 0n ? -tol : tol;
  return abs <= absTol;
}

/**
 * @param {string} amount
 * @returns {string} Amount normalized to exactly 4 decimal places.
 */
export function normalize(amount) {
  const scaled = toScaledInt(amount);
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(SCALE + 1, '0');
  const integer = digits.slice(0, -SCALE);
  const fraction = digits.slice(-SCALE);
  return `${negative ? '-' : ''}${integer}.${fraction}`;
}

/**
 * @param {string} amount
 * @returns {bigint}
 */
export function toScaledInt(amount) {
  let str = String(amount).trim();
  if (str === '') return 0n;

  let negative = false;
  if (str[0] === '-') {
    negative = true;
    str = str.slice(1);
  } else if (str[0] === '+') {
    str = str.slice(1);
  }

  const [rawInt = '', rawFrac = ''] = str.split('.', 2);
  const integer = rawInt.replace(/\D/g, '') || '0';
  const fraction = rawFrac.replace(/\D/g, '').padEnd(SCALE, '0').slice(0, SCALE);

  const combined = (integer + fraction).replace(/^0+/, '') || '0';
  const value = BigInt(combined);
  return negative ? -value : value;
}
