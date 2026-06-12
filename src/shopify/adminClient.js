/**
 * Minimal Shopify Admin GraphQL client for the reconciliation worker.
 *
 * Reconciliation model: orders placed with the "Sham Cash" manual payment
 * method are PENDING. This client lists those pending orders and marks the
 * matched one as paid (orderMarkAsPaid), tagging it with the Sham Cash
 * transaction id for a server-side idempotency guard.
 *
 * @see https://shopify.dev/docs/api/admin-graphql
 */

const PENDING_ORDERS_QUERY = `
  query PendingOrders($query: String!, $cursor: String) {
    orders(first: 50, query: $query, after: $cursor, sortKey: CREATED_AT) {
      edges {
        cursor
        node {
          id
          name
          createdAt
          displayFinancialStatus
          paymentGatewayNames
          tags
          totalPriceSet { shopMoney { amount currencyCode } }
        }
      }
      pageInfo { hasNextPage }
    }
  }`;

const MARK_AS_PAID_MUTATION = `
  mutation MarkPaid($input: OrderMarkAsPaidInput!) {
    orderMarkAsPaid(input: $input) {
      order { id displayFinancialStatus }
      userErrors { field message }
    }
  }`;

const ADD_TAGS_MUTATION = `
  mutation AddTags($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      userErrors { field message }
    }
  }`;

export class ShopifyAdminClient {
  /**
   * @param {import('../config.js').Config} config
   * @param {{ http?: typeof fetch, logger?: Console }} [deps]
   */
  constructor(config, deps = {}) {
    this.config = config;
    this.http = deps.http ?? fetch;
    this.logger = deps.logger ?? null;
    this.endpoint = `https://${config.shopify.shop}/admin/api/${config.shopify.apiVersion}/graphql.json`;
  }

  /**
   * Pending orders created on/after `sinceIso`, normalized.
   * @param {string} sinceIso
   * @returns {Promise<Array<{id:string,name:string,createdAt:string,gatewayNames:string[],tags:string[],amount:string,currency:string}>>}
   */
  async pendingOrders(sinceIso) {
    const query = `financial_status:pending created_at:>=${sinceIso}`;
    /** @type {any[]} */
    const orders = [];
    let cursor = null;

    do {
      const data = await this.#graphql(PENDING_ORDERS_QUERY, { query, cursor });
      const connection = data.orders;
      for (const edge of connection.edges) {
        const node = edge.node;
        orders.push({
          id: node.id,
          name: node.name,
          createdAt: node.createdAt,
          gatewayNames: node.paymentGatewayNames ?? [],
          tags: node.tags ?? [],
          amount: node.totalPriceSet?.shopMoney?.amount ?? '0',
          currency: node.totalPriceSet?.shopMoney?.currencyCode ?? '',
        });
      }
      cursor = connection.pageInfo.hasNextPage
        ? connection.edges[connection.edges.length - 1].cursor
        : null;
    } while (cursor);

    return orders;
  }

  /** @param {string} orderId gid://shopify/Order/... */
  async markAsPaid(orderId) {
    const data = await this.#graphql(MARK_AS_PAID_MUTATION, { input: { id: orderId } });
    const errors = data.orderMarkAsPaid?.userErrors ?? [];
    if (errors.length) {
      throw new Error(`orderMarkAsPaid failed: ${errors.map((e) => e.message).join('; ')}`);
    }
    return data.orderMarkAsPaid.order;
  }

  /**
   * @param {string} orderId
   * @param {string[]} tags
   */
  async addTags(orderId, tags) {
    const data = await this.#graphql(ADD_TAGS_MUTATION, { id: orderId, tags });
    const errors = data.tagsAdd?.userErrors ?? [];
    if (errors.length) {
      throw new Error(`tagsAdd failed: ${errors.map((e) => e.message).join('; ')}`);
    }
  }

  /**
   * @param {string} query
   * @param {Record<string, any>} variables
   * @param {number} [attempt]
   * @returns {Promise<any>}
   */
  async #graphql(query, variables, attempt = 1) {
    const res = await this.http(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.config.shopify.adminToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (res.status === 429 && attempt < 4) {
      const retryAfter = Number(res.headers.get?.('Retry-After')) || attempt * 2;
      this.logger?.debug?.(`Shopify throttled, retrying in ${retryAfter}s`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return this.#graphql(query, variables, attempt + 1);
    }

    const payload = await res.json();
    if (payload.errors) {
      const throttled = payload.errors.some((e) => e.extensions?.code === 'THROTTLED');
      if (throttled && attempt < 4) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
        return this.#graphql(query, variables, attempt + 1);
      }
      throw new Error(`Shopify GraphQL error: ${payload.errors.map((e) => e.message).join('; ')}`);
    }
    return payload.data;
  }
}
