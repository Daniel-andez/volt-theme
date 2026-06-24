import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `[config] Variable de entorno requerida no definida: ${name}\n` +
      `Copia .env.example a .env y completa los valores.`
    );
  }
  return value.trim();
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  shopify: {
    storeDomain: requireEnv('SHOPIFY_STORE_DOMAIN'),
    adminAccessToken: requireEnv('SHOPIFY_ADMIN_ACCESS_TOKEN'),
    apiVersion: optionalEnv('SHOPIFY_API_VERSION', '2025-01'),
  },
  anthropic: {
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
    model: optionalEnv('CLAUDE_MODEL', 'claude-opus-4-8'),
  },
  brand: {
    name: optionalEnv('BRAND_NAME', 'Mi Tienda'),
    slug: optionalEnv('BRAND_SLUG', 'mi-tienda'),
    voice: optionalEnv('BRAND_VOICE', 'una marca premium'),
    category: optionalEnv('BRAND_CATEGORY', 'fashion'), // 'fashion' | 'skincare'
  },
  targets: {
    productIds: process.env.TARGET_PRODUCT_IDS
      ? process.env.TARGET_PRODUCT_IDS.split(',').map(s => s.trim()).filter(Boolean)
      : [],
    handles: process.env.TARGET_HANDLES
      ? process.env.TARGET_HANDLES.split(',').map(s => s.trim()).filter(Boolean)
      : [],
  },
  output: {
    dir: resolve(__dirname, '../../output'),
    backupsDir: resolve(__dirname, '../../output/backups'),
    previewsDir: resolve(__dirname, '../../output/previews'),
    imagesOriginalDir: resolve(__dirname, '../../output/images/original'),
    imagesOptimizedDir: resolve(__dirname, '../../output/images/optimized'),
    logsDir: resolve(__dirname, '../../output/logs'),
  },
} as const;

export function getShopifyGraphQLUrl(): string {
  return `https://${config.shopify.storeDomain}/admin/api/${config.shopify.apiVersion}/graphql.json`;
}
