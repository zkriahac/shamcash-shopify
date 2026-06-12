/**
 * File-backed idempotency ledger: records which Sham Cash transaction_id has
 * been credited to which Shopify order, so one transfer can never pay two
 * orders. Reads/writes a single JSON file; adequate for a single reconciliation
 * worker. (Order tagging in Shopify provides a second, server-side guard.)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export class ClaimStore {
  /** @param {string} filePath */
  constructor(filePath) {
    this.filePath = filePath;
    /** @type {Record<string, { orderId: string, reference: string, amount: string, currency: string, matchedBy: string, at: string }>} */
    this.claims = this.#load();
  }

  #load() {
    try {
      if (existsSync(this.filePath)) {
        return JSON.parse(readFileSync(this.filePath, 'utf8'));
      }
    } catch {
      // Corrupt/unreadable ledger — start fresh rather than crash the worker.
    }
    return {};
  }

  #persist() {
    const dir = dirname(this.filePath);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.filePath, JSON.stringify(this.claims, null, 2));
  }

  /**
   * Atomically (within this process) claim a transaction for an order.
   * @returns {boolean} true if claimed by this call, false if already claimed.
   */
  claim(transactionId, { orderId, reference, amount, currency, matchedBy }) {
    if (this.claims[transactionId]) {
      return false;
    }
    this.claims[transactionId] = {
      orderId: String(orderId),
      reference: String(reference ?? ''),
      amount: String(amount ?? ''),
      currency: String(currency ?? ''),
      matchedBy: String(matchedBy ?? ''),
      at: new Date().toISOString(),
    };
    this.#persist();
    return true;
  }

  /** @returns {string|null} */
  orderIdFor(transactionId) {
    return this.claims[transactionId]?.orderId ?? null;
  }

  release(transactionId) {
    if (this.claims[transactionId]) {
      delete this.claims[transactionId];
      this.#persist();
    }
  }
}
