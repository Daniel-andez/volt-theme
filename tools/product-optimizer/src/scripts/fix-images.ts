import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import { logger, initLogger } from '../utils/logger.js';
import { shopifyGraphQL } from '../api/shopify-client.js';
import { deleteProductMedia } from '../api/shopify-mutations.js';
import { processProductImages, uploadOptimizedImage, buildFilename } from '../modules/images.js';
import { config } from '../config/env.js';
import type { ProductBackup } from '../types/index.js';

interface CurrentMedia {
  id: string;
  url: string;
}

interface ProductMediaResponse {
  product: {
    id: string;
    title: string;
    status: string;
    media: {
      edges: Array<{
        node: { mediaContentType: string; id?: string; image?: { url: string } };
      }>;
    };
  } | null;
}

const PRODUCT_MEDIA_QUERY = `
  query GetProductMedia($id: ID!) {
    product(id: $id) {
      id
      title
      status
      media(first: 100) {
        edges {
          node {
            mediaContentType
            ... on MediaImage {
              id
              image { url }
            }
          }
        }
      }
    }
  }
`;

interface Options {
  handles?: string[];
  dryRun: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const opts: Options = { dryRun: false };
  const handlesArg = args.find(a => a.startsWith('--handles='));
  if (handlesArg) opts.handles = handlesArg.replace('--handles=', '').split(',').map(s => s.trim()).filter(Boolean);
  const positional = args.filter(a => !a.startsWith('--'));
  if (!opts.handles && positional.length > 0) opts.handles = positional;
  if (args.includes('--dry-run')) opts.dryRun = true;
  return opts;
}

function loadLatestBackups(): ProductBackup[] {
  const files = readdirSync(config.output.backupsDir).filter(f => f.endsWith('.json'));
  const latest = new Map<string, ProductBackup>();
  for (const file of files) {
    try {
      const b = JSON.parse(readFileSync(resolve(config.output.backupsDir, file), 'utf-8')) as ProductBackup;
      const existing = latest.get(b.product.id);
      if (!existing || b.timestamp > existing.timestamp) latest.set(b.product.id, b);
    } catch {
      // skip malformed backup
    }
  }
  return [...latest.values()];
}

async function fetchCurrentMedia(productId: string): Promise<CurrentMedia[]> {
  const data = await shopifyGraphQL<ProductMediaResponse>({
    query: PRODUCT_MEDIA_QUERY,
    variables: { id: productId },
    estimatedCost: 30,
  });
  if (!data.product) return [];
  return data.product.media.edges
    .filter(e => e.node.mediaContentType === 'IMAGE' && e.node.id && e.node.image?.url)
    .map(e => ({ id: e.node.id!, url: e.node.image!.url }));
}

async function main() {
  initLogger('fix-images');
  const opts = parseArgs();

  logger.separator();
  logger.info(`${config.brand.name} — Arreglar imágenes (reemplazar duplicados + nombres limpios)`);
  if (opts.dryRun) logger.warn('MODO DRY-RUN — no se hará ningún cambio, solo reporte');
  logger.separator();

  let backups = loadLatestBackups().filter(b => b.product.status === 'ACTIVE');
  if (opts.handles) backups = backups.filter(b => opts.handles!.includes(b.product.handle));

  logger.info(`Productos activos a revisar: ${backups.length}`);
  logger.separator();

  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < backups.length; i++) {
    const backup = backups[i];
    const product = backup.product;
    const handle = product.handle;
    logger.progress(i + 1, backups.length, handle);

    const originalCount = product.media.length;
    if (originalCount === 0) {
      logger.info(`${handle}: sin imágenes originales — omitido`);
      skipped++;
      continue;
    }

    let current: CurrentMedia[];
    try {
      current = await fetchCurrentMedia(product.id);
    } catch (e) {
      logger.error(`${handle}: no se pudo leer las imágenes actuales — ${(e as Error).message}`);
      errors++;
      continue;
    }

    // Desired clean filenames (without numeric prefix)
    const desiredNames = product.media.map((_, idx) => buildFilename(product, idx, 'webp'));
    const alreadyClean =
      current.length === originalCount &&
      desiredNames.every(name => current.some(m => m.url.includes(name.replace(/\.webp$/, ''))));

    if (alreadyClean) {
      logger.success(`${handle}: ya está correcto (${current.length} imágenes) — nada que hacer`);
      skipped++;
      continue;
    }

    logger.warn(`${handle}: ${current.length} imagen(es) actuales → objetivo ${originalCount} con nombre limpio`);

    if (opts.dryRun) {
      desiredNames.forEach(n => logger.info(`  → quedaría: ${n}`));
      continue;
    }

    // 1. Re-download + optimize the ORIGINAL images (from backup URLs) with clean names.
    let imageResults;
    try {
      imageResults = await processProductImages(product);
    } catch (e) {
      logger.error(`${handle}: error optimizando — ${(e as Error).message} — NO se tocó nada`);
      errors++;
      continue;
    }

    // Safety: if we couldn't recover every original image, do NOT delete anything.
    if (imageResults.length < originalCount) {
      logger.error(`${handle}: solo se recuperaron ${imageResults.length}/${originalCount} originales — se omite para no perder fotos`);
      errors++;
      continue;
    }

    // 2. Upload the clean optimized images first (so nothing is deleted before new ones exist).
    let uploadOk = true;
    for (let k = 0; k < imageResults.length; k++) {
      const r = imageResults[k];
      const alt = backup.optimization?.alt_texts?.[k] || product.media[k]?.alt || '';
      try {
        await uploadOptimizedImage(r.optimizedPath, product.id, alt, r.newFilename);
      } catch (e) {
        logger.error(`${handle}: falló subir "${r.newFilename}" — ${(e as Error).message}`);
        uploadOk = false;
        break;
      }
    }

    if (!uploadOk) {
      logger.error(`${handle}: subida incompleta — NO se borró ninguna imagen vieja (revisa el producto)`);
      errors++;
      continue;
    }

    // 3. Delete all the previously-existing media (the duplicates / ugly-named ones).
    try {
      await deleteProductMedia(product.id, current.map(m => m.id));
      logger.success(`${handle}: ${current.length} imagen(es) vieja(s) borrada(s), ${imageResults.length} limpia(s) subida(s)`);
      fixed++;
    } catch (e) {
      logger.error(`${handle}: subió las nuevas pero falló borrar las viejas — ${(e as Error).message} (revisa el producto)`);
      errors++;
    }
  }

  logger.separator();
  logger.info(`Resultado: ${fixed} arreglado(s) / ${skipped} ya estaban bien / ${errors} con problemas / ${backups.length} total`);
  if (errors > 0) logger.warn('Revisa en Shopify los productos con problemas.');
}

main().catch(err => {
  logger.error(`Error fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
