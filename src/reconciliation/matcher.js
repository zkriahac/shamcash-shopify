/**
 * Reconciliation engine: matches incoming Sham Cash transfers to pending
 * Shopify orders and marks the matched orders as paid.
 *
 * Strategy mirrors the Magento/WooCommerce modules: reference/note-first
 * (verified by amount + currency), with an unambiguous amount + currency
 * fallback. A transfer is claimed exactly once (ClaimStore + order tag).
 */

import {
  MATCH_MODE_AMOUNT,
  MATCH_MODE_BOTH,
  MATCH_MODE_NOTE,
  coinId,
  isCurrencyAllowed,
} from '../config.js';
import { SubscriptionUnavailableError } from '../shamcash/errors.js';
import {
  amountWithinTolerance,
  currencyMatches,
  noteMatches,
  normalize,
  referenceCandidates,
} from './matchRules.js';

export class Matcher {
  /**
   * @param {{ shopify: import('../shopify/adminClient.js').ShopifyAdminClient,
   *           shamcash: import('../shamcash/apiClient.js').ShamCashClient,
   *           store: import('./claimStore.js').ClaimStore,
   *           config: import('../config.js').Config,
   *           logger?: Console }} deps
   */
  constructor({ shopify, shamcash, store, config, logger }) {
    this.shopify = shopify;
    this.shamcash = shamcash;
    this.store = store;
    this.config = config;
    this.logger = logger ?? console;
  }

  /**
   * Reconcile every eligible pending order.
   * @returns {Promise<{matched:any[],pending:any[],errors:any[],aborted:boolean}>}
   */
  async reconcileAll() {
    const summary = { matched: [], pending: [], errors: [], aborted: false };

    const sinceIso = new Date(
      Date.now() - this.config.matching.orderMaxAgeMinutes * 60_000,
    ).toISOString();

    const allPending = await this.shopify.pendingOrders(sinceIso);
    const orders = allPending.filter((o) => this.#isEligible(o));
    if (orders.length === 0) {
      return summary;
    }

    let transactions;
    try {
      transactions = await this.#fetchTransactions(orders);
    } catch (err) {
      if (err instanceof SubscriptionUnavailableError) {
        this.logger.warn?.(`Subscription unavailable: ${err.message}`);
        summary.aborted = true;
        return summary;
      }
      throw err;
    }

    const usedTxIds = new Set();
    for (const order of orders) {
      try {
        const result = await this.#matchOrder(order, transactions, usedTxIds);
        if (result.status === 'matched') {
          usedTxIds.add(result.transactionId);
          summary.matched.push(result);
        } else {
          summary.pending.push(result);
        }
      } catch (err) {
        summary.errors.push({ orderName: order.name, message: err.message });
        this.logger.error?.(`Error matching ${order.name}: ${err.message}`);
      }
    }

    return summary;
  }

  /**
   * @param {any} order
   * @param {ReturnType<typeof import('../shamcash/dto.js').parseTransaction>[]} transactions
   * @param {Set<string>} usedTxIds
   */
  async #matchOrder(order, transactions, usedTxIds) {
    const candidate = this.#selectCandidate(order, transactions, usedTxIds);
    if (!candidate) {
      return { orderName: order.name, status: 'pending', message: 'No matching transfer yet.' };
    }

    const { transaction, matchedBy } = candidate;
    const claimed = this.store.claim(transaction.transactionId, {
      orderId: order.id,
      reference: order.name,
      amount: normalize(transaction.amount),
      currency: transaction.currencyCode,
      matchedBy,
    });

    if (!claimed) {
      const owner = this.store.orderIdFor(transaction.transactionId);
      const status = owner === order.id ? 'already_paid' : 'pending';
      return {
        orderName: order.name,
        status,
        message:
          status === 'already_paid'
            ? 'Already recorded.'
            : 'Matching transfer already claimed by another order.',
      };
    }

    try {
      await this.shopify.markAsPaid(order.id);
      await this.shopify.addTags(order.id, [`shamcash-tx-${transaction.transactionId}`]);
    } catch (err) {
      // Roll back the local claim so a transient Shopify error can be retried.
      this.store.release(transaction.transactionId);
      throw err;
    }

    this.logger.info?.(
      `Marked ${order.name} as paid (tx ${transaction.transactionId}, by ${matchedBy}).`,
    );
    return {
      orderName: order.name,
      status: 'matched',
      transactionId: transaction.transactionId,
      matchedBy,
      message: `Paid via Sham Cash transaction ${transaction.transactionId}.`,
    };
  }

  /**
   * @param {any} order
   * @param {any[]} transactions
   * @param {Set<string>} usedTxIds
   * @returns {{transaction:any, matchedBy:string}|null}
   */
  #selectCandidate(order, transactions, usedTxIds) {
    const mode = this.config.matching.mode;
    const tolerance = this.config.matching.tolerance;
    const expected = normalize(order.amount);
    const references = referenceCandidates(order.name);

    const available = (tx) =>
      !usedTxIds.has(tx.transactionId) && !this.#claimedByOther(tx, order);

    if (mode === MATCH_MODE_NOTE || mode === MATCH_MODE_BOTH) {
      const byNote = transactions.find(
        (tx) =>
          available(tx) &&
          noteMatches(tx.note, references) &&
          currencyMatches(tx.currencyCode, order.currency) &&
          amountWithinTolerance(tx.amount, expected, tolerance),
      );
      if (byNote) return { transaction: byNote, matchedBy: MATCH_MODE_NOTE };
    }

    if (mode === MATCH_MODE_AMOUNT || mode === MATCH_MODE_BOTH) {
      const byAmount = transactions.filter(
        (tx) =>
          available(tx) &&
          currencyMatches(tx.currencyCode, order.currency) &&
          amountWithinTolerance(tx.amount, expected, tolerance),
      );
      if (byAmount.length === 1) return { transaction: byAmount[0], matchedBy: MATCH_MODE_AMOUNT };
    }

    return null;
  }

  #claimedByOther(tx, order) {
    const owner = this.store.orderIdFor(tx.transactionId);
    return owner !== null && owner !== order.id;
  }

  /**
   * Fetch transactions once for the window covering every order.
   * @param {any[]} orders
   */
  async #fetchTransactions(orders) {
    const earliest = orders.reduce(
      (min, o) => Math.min(min, new Date(o.createdAt).getTime()),
      Date.now(),
    );
    const startAt = new Date(earliest - this.config.matching.graceMinutes * 60_000).toISOString();

    const currencies = new Set(orders.map((o) => String(o.currency).toUpperCase()));
    const filters = { start_at: startAt, end_at: new Date().toISOString(), limit: 250 };
    if (currencies.size === 1) {
      const only = coinId(this.config, [...currencies][0]);
      if (only) filters.coin_id = only;
    }

    return this.shamcash.transactions(this.config.shamcash.accountId, filters);
  }

  /** @param {any} order */
  #isEligible(order) {
    const gatewayMatch = order.gatewayNames.some(
      (g) => g.toLowerCase() === this.config.matching.gatewayName.toLowerCase(),
    );
    const alreadyTagged = order.tags.some((t) => t.startsWith('shamcash-tx-'));
    return gatewayMatch && !alreadyTagged && isCurrencyAllowed(this.config, order.currency);
  }
}
