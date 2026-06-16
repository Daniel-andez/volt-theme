import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { updateProduct, updateProductMediaAlt } from '../api/shopify-mutations.js';
import type { ProductBackup } from '../types/index.js';

export interface RollbackOptions {
  handles?: string[];
  backupTimestamp?: string;
  dryRun?: boolean;
}

function parseArgs(): RollbackOptions {
  const args = process.argv.slice(2);
  const opts: RollbackOptions = { dryRun: false };

  const handlesArg = args.find(a => a.startsWith('--handles='));
  if (handlesArg) opts.handles = handlesArg.replace('--handles=', '').split(',').map(s => s.trim());

  const tsArg = args.find(a => a.startsWith('--timestamp='));
  if (tsArg) opts.backupTimestamp = tsArg.replace('--timestamp=', '');

  if (args.includes('--dry-run')) opts.dryRun = true;

  return opts;
}

function findBackups(handle?: string, timestamp?: string): ProductBackup[] {
  const files = readdirSync(config.output.backupsDir).filter(f => f.endsWith('.json'));

  let filtered = files;
  if (handle) filtered = filtered.filter(f => f.endsWith(`-${handle}.json`));
  if (timestamp) filtered = filtered.filter(f => f.startsWith(timestamp));

  // If multiple backups per handle, use the latest
  const latestPerHandle = new Map<string, string>();
  filtered.sort().forEach(f => {
    // filename format: TIMESTAMP-handle.json
    const handlePart = f.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/, '').replace('.json', '');
    latestPerHandle.set(handlePart, f);
  });

  return [...latestPerHandle.values()].map(f => {
    const path = resolve(config.output.backupsDir, f);
    return JSON.parse(readFileSync(path, 'utf-8')) as ProductBackup;
  });
}

async function rollbackProduct(backup: ProductBackup, dryRun: boolean): Promise<void> {
  const { product } = backup;
  logger.info(`Revirtiendo "${product.handle}"...`, product.handle);

  if (dryRun) {
    logger.info(`[DRY] title: "${product.title}"`, product.handle);
    logger.info(`[DRY] seo.title: "${product.seo.title}"`, product.handle);
    logger.info(`[DRY] seo.description: "${product.seo.description}"`, product.handle);
    logger.info(`[DRY] tags: ${product.tags.join(', ')}`, product.handle);
    logger.info(`[DRY] ALT texts: ${product.media.length} imagen(es)`, product.handle);
    return;
  }

  // Restore product metadata
  await updateProduct({
    id: product.id,
    title: product.title,
    descriptionHtml: product.descriptionHtml,
    seo: { title: product.seo.title, description: product.seo.description },
    tags: product.tags,
  });

  // Restore ALT texts
  if (product.media.length > 0) {
    const mediaUpdates = product.media.map(m => ({ id: m.id, alt: m.alt ?? '' }));
    await updateProductMediaAlt(product.id, mediaUpdates);
  }

  logger.success(`"${product.handle}" revertido exitosamente`, product.handle);
}

export async function runRollback(options?: RollbackOptions): Promise<void> {
  const opts = options ?? parseArgs();

  logger.separator();
  logger.warn('ROLLBACK — revertiendo productos a sus valores originales del backup');
  if (opts.dryRun) logger.info('Modo DRY RUN — sin cambios reales en Shopify');
  logger.separator();

  let backups: ProductBackup[];
  try {
    backups = findBackups(
      opts.handles?.length === 1 ? opts.handles[0] : undefined,
      opts.backupTimestamp
    );
  } catch (err) {
    logger.error(`No se encontraron backups: ${(err as Error).message}`);
    return;
  }

  // Filter by multiple handles if provided
  if (opts.handles && opts.handles.length > 1) {
    backups = backups.filter(b => opts.handles!.includes(b.product.handle));
  }

  if (backups.length === 0) {
    logger.warn('No se encontraron backups para los criterios dados.');
    return;
  }

  logger.info(`Productos a revertir: ${backups.length}`);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < backups.length; i++) {
    logger.progress(i + 1, backups.length, backups[i].product.handle);
    try {
      await rollbackProduct(backups[i], opts.dryRun ?? false);
      ok++;
    } catch (err) {
      logger.error(`Error en rollback de "${backups[i].product.handle}": ${(err as Error).message}`);
      fail++;
    }
  }

  logger.separator();
  logger.info(`Rollback completo: ${ok} exitosos / ${fail} con errores`);
}
