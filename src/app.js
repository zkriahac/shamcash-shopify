/**
 * Composition root: build a configured Matcher from environment config.
 */

import { assertConfigured } from './config.js';
import { ShamCashClient } from './shamcash/apiClient.js';
import { ClaimStore } from './reconciliation/claimStore.js';
import { Matcher } from './reconciliation/matcher.js';
import { ShopifyAdminClient } from './shopify/adminClient.js';

/**
 * @param {import('./config.js').Config} config
 * @param {{ logger?: Console }} [deps]
 * @returns {Matcher}
 */
export function buildMatcher(config, deps = {}) {
  assertConfigured(config);
  const logger = deps.logger ?? console;
  return new Matcher({
    config,
    logger,
    shopify: new ShopifyAdminClient(config, { logger }),
    shamcash: new ShamCashClient(config, { logger }),
    store: new ClaimStore(config.store.ledgerPath),
  });
}

/**
 * @param {{matched:any[],pending:any[],errors:any[],aborted:boolean}} summary
 */
export function formatSummary(summary) {
  if (summary.aborted) {
    return 'Reconciliation aborted: Sham Cash subscription unavailable.';
  }
  const lines = [
    `Matched: ${summary.matched.length}`,
    `Pending: ${summary.pending.length}`,
    `Errors:  ${summary.errors.length}`,
  ];
  for (const m of summary.matched) {
    lines.push(`  ✓ ${m.orderName} ← ${m.transactionId} (${m.matchedBy})`);
  }
  for (const e of summary.errors) {
    lines.push(`  ! ${e.orderName}: ${e.message}`);
  }
  return lines.join('\n');
}
