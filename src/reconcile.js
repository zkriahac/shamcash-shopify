#!/usr/bin/env node
/**
 * One-shot reconciliation: list pending Sham Cash orders, match against
 * recent transfers, mark matched orders paid. Intended for cron / `npm run
 * reconcile`. Exits non-zero on failure so schedulers can alert.
 */

import { buildMatcher, formatSummary } from './app.js';
import { loadConfig } from './config.js';

async function main() {
  const config = loadConfig();
  const matcher = buildMatcher(config);
  const summary = await matcher.reconcileAll();
  console.log(formatSummary(summary));
  process.exitCode = summary.errors.length > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(`Reconciliation failed: ${err.message}`);
  process.exit(1);
});
