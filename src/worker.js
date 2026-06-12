#!/usr/bin/env node
/**
 * Long-running worker: reconciles on a fixed interval. Use this when you can
 * keep a process running; otherwise schedule src/reconcile.js with cron.
 */

import { buildMatcher, formatSummary } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const matcher = buildMatcher(config);
let running = false;
let stopped = false;

async function tick() {
  if (running || stopped) return;
  running = true;
  try {
    const summary = await matcher.reconcileAll();
    if (summary.matched.length || summary.errors.length || summary.aborted) {
      console.log(`[${new Date().toISOString()}]\n${formatSummary(summary)}`);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Reconciliation error: ${err.message}`);
  } finally {
    running = false;
  }
}

console.log(
  `Sham Cash → Shopify reconciliation worker started (every ${config.poll.intervalMs / 1000}s).`,
);
tick();
const timer = setInterval(tick, config.poll.intervalMs);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopped = true;
    clearInterval(timer);
    console.log('Worker stopped.');
    process.exit(0);
  });
}
