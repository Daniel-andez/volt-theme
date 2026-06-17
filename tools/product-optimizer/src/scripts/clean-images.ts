import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import { logger, initLogger } from '../utils/logger.js';
import { shopifyGraphQL } from '../api/shopify-client.js';
import { deleteProductMedia } from '../api/shopify-mutations.js';
import { config } from '../config/env.js';
import type { ProductBackup } from '../types/index.js';

interface MediaNode {
  id: string;
  mediaContentType: string;
}

interface ProductMediaResponse {
  product: {
    id: string;
    title: string;
    media: {
      edges: Array<{ node: MediaNode }>;
    };
  } | null;
}

const PRODUCT_MEDIA_QUERY = `
  query GetProductMedia($id: ID!) {
    product(id: $id) {
      id
      title
      media(first: 50) {
        edges {
          node {
            mediaContentType
            ... on MediaImage {
              id
            }
          }
        }
      }
    }
  }
`;

function numericId(gid: string): number {
  return parseInt(gid.split('/').pop() ?? '0', 10);
}

function loadBackups(): ProductBackup[] {
  const backupsDir = config.output.backupsDir;
  const files = readdirSync(backupsDir).filter(f => f.endsWith('.json'));
  const backups: ProductBackup[] = [];

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(resolve(backupsDir, file), 'utf-8')) as ProductBackup;
      backups.push(data);
    } catch {
      // skip malformed files
    }
  }

  // Keep only the latest backup per product
  const latest = new Map<string, ProductBackup>();
  for (const b of backups) {
    const existing = latest.get(b.product.id);
    if (!existing || b.backedUpAt > existing.backedUpAt) {
      latest.set(b.product.id, b);
    }
  }

  return [...latest.values()];
}

async function main() {
  initLogger('clean-images');
  logger.separator();
  logger.info('ANARIAS Atelier — Limpieza de imágenes duplicadas');
  logger.separator();

  const backups = loadBackups();
  logger.info(`Backups encontrados: ${backups.length} productos`);

  let totalDeleted = 0;

  for (const backup of backups) {
    const originalCount = backup.product.media.length;
    const productId = backup.product.id;

    const data = await shopifyGraphQL<ProductMediaResponse>({
      query: PRODUCT_MEDIA_QUERY,
      variables: { id: productId },
      estimatedCost: 30,
    });

    if (!data.product) {
      logger.warn(`Producto no encontrado: ${backup.product.handle}`);
      continue;
    }

    const currentMedia = data.product.media.edges
      .filter(e => e.node.mediaContentType === 'IMAGE' && e.node.id)
      .map(e => e.node);

    const currentCount = currentMedia.length;

    if (currentCount <= originalCount) {
      logger.info(`${backup.product.handle}: OK (${currentCount} imágenes)`);
      continue;
    }

    // Sort by numeric ID — lowest IDs are the originals
    const sorted = [...currentMedia].sort((a, b) => numericId(a.id) - numericId(b.id));
    const toDelete = sorted.slice(originalCount).map(m => m.id);

    logger.warn(`${backup.product.handle}: ${currentCount} imágenes → borrando ${toDelete.length} duplicado(s)`);

    try {
      await deleteProductMedia(productId, toDelete);
      totalDeleted += toDelete.length;
      logger.success(`${backup.product.handle}: listo`);
    } catch (err) {
      logger.error(`${backup.product.handle}: error borrando — ${(err as Error).message}`);
    }
  }

  logger.separator();
  logger.success(`Limpieza completada. Imágenes duplicadas eliminadas: ${totalDeleted}`);
}

main().catch(err => {
  logger.error(`Error fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
