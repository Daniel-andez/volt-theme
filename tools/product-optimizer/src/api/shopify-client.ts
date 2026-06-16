import { config, getShopifyGraphQLUrl } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/helpers.js';
import type { GraphQLResponse } from '../types/index.js';

const MAX_RETRIES = 4;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

// Leaky bucket: Shopify grants 1000 points, restores at 50/s
// Each query costs ~10–100 points depending on complexity
class RateLimiter {
  private available = 800; // start conservatively
  private lastCheck = Date.now();
  private readonly maxPoints = 1000;
  private readonly restoreRate = 50; // points/sec

  async acquire(cost: number): Promise<void> {
    const now = Date.now();
    const elapsed = (now - this.lastCheck) / 1000;
    this.available = Math.min(this.maxPoints, this.available + elapsed * this.restoreRate);
    this.lastCheck = now;

    if (this.available < cost) {
      const waitMs = ((cost - this.available) / this.restoreRate) * 1000;
      logger.debug(`Rate limit: aguardando ${Math.ceil(waitMs)}ms`);
      await sleep(waitMs);
      this.available = cost; // refreshed after wait
    }
    this.available -= cost;
  }

  // Parse Shopify throttle headers to sync local state
  sync(headers: Headers) {
    const status = headers.get('x-shopify-shop-api-call-limit');
    if (status) {
      const [used, max] = status.split('/').map(Number);
      if (!isNaN(used) && !isNaN(max)) {
        this.available = max - used;
      }
    }
  }
}

const rateLimiter = new RateLimiter();

interface GraphQLRequestOptions {
  query: string;
  variables?: Record<string, unknown>;
  estimatedCost?: number;
}

export async function shopifyGraphQL<T>(opts: GraphQLRequestOptions): Promise<T> {
  await rateLimiter.acquire(opts.estimatedCost ?? 50);

  const url = getShopifyGraphQLUrl();
  const body = JSON.stringify({ query: opts.query, variables: opts.variables });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': config.shopify.adminAccessToken,
        },
        body,
      });
    } catch (err) {
      if (attempt === MAX_RETRIES) throw new Error(`Shopify fetch falló tras ${MAX_RETRIES} reintentos: ${err}`);
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    // Sync rate-limit state from response headers
    rateLimiter.sync(res.headers);

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '2', 10) * 1000;
      logger.warn(`429 Too Many Requests — reintentando en ${retryAfter}ms`);
      await sleep(retryAfter);
      continue;
    }

    if (res.status === 503 || res.status === 502) {
      if (attempt === MAX_RETRIES) throw new Error(`Shopify respondió ${res.status} tras ${MAX_RETRIES} reintentos`);
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} de Shopify: ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as GraphQLResponse<T>;

    if (json.errors && json.errors.length > 0) {
      const msgs = json.errors.map(e => e.message).join(' | ');
      // THROTTLED is a retryable GraphQL error
      if (json.errors.some(e => e.extensions?.code === 'THROTTLED')) {
        if (attempt === MAX_RETRIES) throw new Error(`Throttled tras ${MAX_RETRIES} reintentos`);
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw new Error(`GraphQL error: ${msgs}`);
    }

    if (!json.data) throw new Error('Shopify devolvió respuesta vacía (sin data ni errors)');

    return json.data;
  }

  throw new Error('shopifyGraphQL: máximo de reintentos alcanzado');
}

export async function fetchImageSize(url: string): Promise<number> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const len = res.headers.get('content-length');
    return len ? parseInt(len, 10) : 0;
  } catch {
    return 0;
  }
}
