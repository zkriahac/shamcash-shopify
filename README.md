**English** | [العربية](README.ar.md)

# Sham Cash for Shopify

Reconciliation worker that confirms **Sham Cash** (شام كاش) wallet payments for
a Shopify store.

## Why a worker, not a payment gateway

Shopify's Payments Apps API is for licensed payment *processors* and requires
Shopify approval; the public Sham Cash API is **read-only** (accounts, balances,
transactions — Bearer auth, no payment-initiation call, no webhook). So the
pragmatic, immediately-usable model is:

1. The merchant adds a **Manual payment method** named **"Sham Cash"** in
   *Settings → Payments → Manual payment methods*, with transfer instructions.
2. Customers choose it at checkout → the order is created as **Payment
   pending**, with the order name (e.g. `#1001`) as the reference.
3. The customer transfers from the Sham Cash app, putting the order reference in
   the note.
4. This worker reads the merchant's `/transactions`, matches the incoming
   transfer to the pending order (**note/reference-first**, verified by amount +
   currency, with an unambiguous amount + currency fallback), and marks the
   order **paid** via the Admin API (`orderMarkAsPaid`), tagging it
   `shamcash-tx-<id>`.

A transfer is credited to only one order (local claim ledger **plus** the
Shopify order tag).

## Requirements

- Node.js **18+** (uses global `fetch`; **zero runtime dependencies**)
- A Shopify **custom app** Admin API token with `read_orders` + `write_orders`
- An **active Sham Cash API subscription** on the linked account

## Install

Install as a package (no copying files around):

```bash
# global install — provides the `shamcash-reconcile` and `shamcash-worker` commands
npm install -g github:zkriahac/shamcash-shopify

# or per-project
npm install github:zkriahac/shamcash-shopify
```

Zero runtime dependencies, so the install is instant. (Once published to npm,
`npm install -g shamcash-shopify` works directly.)

## Setup

```bash
cp .env.example .env   # fill in Shopify + Sham Cash credentials
```

(With a global install, put the variables in the environment or point the
commands at an env file with your process manager.)

Create the manual payment method in Shopify and make `SHAMCASH_GATEWAY_NAME`
match its name exactly.

Run once (for cron):

```bash
npm run reconcile
```

Run continuously (polls every `SHAMCASH_POLL_INTERVAL_SECONDS`):

```bash
npm start
```

Example cron entry (every 5 minutes):

```cron
*/5 * * * * cd /opt/.../shamcash-shopify && /usr/bin/node src/reconcile.js >> reconcile.log 2>&1
```

## Configuration

All configuration is via environment variables — see `.env.example`. Key ones:
`SHOPIFY_SHOP`, `SHOPIFY_ADMIN_TOKEN`, `SHAMCASH_API_TOKEN`,
`SHAMCASH_ACCOUNT_ID`, `SHAMCASH_GATEWAY_NAME`, `SHAMCASH_MATCH_MODE`
(`note` | `amount` | `both`), `SHAMCASH_AMOUNT_TOLERANCE`,
`SHAMCASH_ALLOWED_CURRENCIES`, `SHAMCASH_TIME_WINDOW_GRACE`,
`SHAMCASH_ORDER_MAX_AGE`.

## Architecture

```
src/
├── config.js                  # env-driven, validated configuration
├── app.js                     # composition root + summary formatting
├── reconcile.js               # one-shot CLI entry (cron)
├── worker.js                  # long-running interval entry
├── shamcash/                  # read-only Sham Cash API client
│   ├── apiClient.js           #   fetch + retry/backoff (Retry-After)
│   ├── responseParser.js      #   envelope -> data | typed errors
│   ├── dto.js                 #   account/balance/transaction normalizers
│   └── errors.js
├── shopify/adminClient.js     # Admin GraphQL: pending orders, orderMarkAsPaid, tags
└── reconciliation/
    ├── matchRules.js          # pure BigInt fixed-point matching (shared logic)
    ├── matcher.js             # orchestration
    └── claimStore.js          # JSON-file idempotency ledger
```

`matchRules.js`, the API client and the parsing logic mirror the Magento module
and the WooCommerce plugin, so matching behaves identically across all three
platforms.

## Testing

```bash
npm test        # node --test, no dependencies to install
```

CI runs the suite on Node 18/20/22 (`.github/workflows/tests.yml`).

## Notes / possible follow-ups

- Idempotency is local (JSON ledger) + the Shopify order tag. For multiple
  concurrent workers, move the ledger to a shared store or rely solely on the
  order tag with a conditional check.
- If you later get Payments Apps API access, the same `shamcash/` and
  `reconciliation/` modules can drive a native gateway.
- Sister projects: the [Magento 2 module](https://github.com/zkriahac/shamcash-magento2)
  and the [WooCommerce plugin](https://github.com/zkriahac/shamcash-woocommerce).
