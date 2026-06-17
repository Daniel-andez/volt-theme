import { mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { fetchProductByHandle } from '../api/shopify-queries.js';
import { updateProduct, updateProductMediaAlt, deleteProductMedia } from '../api/shopify-mutations.js';
import { uploadOptimizedImage } from './images.js';
import { loadLatestPreview, loadLatestBackupForProduct } from './preview.js';
import type { ApplyResult, PreviewRecord, ProductBackup } from '../types/index.js';

export interface ApplyOptions {
  handles?: string[];
  fields?: ApplyField[];
  dryRun?: boolean;
}

export type ApplyField =
  | 'title'
  | 'description'
  | 'seo'
  | 'tags'
  | 'alt_texts'
  | 'images';

const ALL_FIELDS: ApplyField[] = ['description', 'seo', 'tags', 'alt_texts'];

function parseArgs(): ApplyOptions {
  const args = process.argv.slice(2);
  const opts: ApplyOptions = { dryRun: false, fields: ALL_FIELDS };

  const handlesArg = args.find(a => a.startsWith('--handles='));
  if (handlesArg) opts.handles = handlesArg.replace('--handles=', '').split(',').map(s => s.trim());

  const fieldsArg = args.find(a => a.startsWith('--fields='));
  if (fieldsArg) opts.fields = fieldsArg.replace('--fields=', '').split(',').map(s => s.trim()) as ApplyField[];

  if (args.includes('--dry-run')) opts.dryRun = true;

  return opts;
}

async function applyRecord(
  record: PreviewRecord,
  backup: ProductBackup,
  fields: ApplyField[],
  dryRun: boolean
): Promise<ApplyResult> {
  const result: ApplyResult = {
    productId: record.product_id,
    handle: record.handle,
    success: true,
    changes: [],
    errors: [],
    skipped: [],
  };

  const opt = backup.optimization;
  if (!opt) {
    result.errors.push('No hay datos de optimización en el backup. Ejecuta preview primero.');
    result.success = false;
    return result;
  }

  const product = backup.product;

  // ── 1. Title ────────────────────────────────────────────────
  if (fields.includes('title') && opt.title_suggested !== product.title) {
    if (dryRun) {
      result.changes.push(`[DRY] title: "${product.title}" → "${opt.title_suggested}"`);
    } else {
      try {
        await updateProduct({ id: product.id, title: opt.title_suggested });
        result.changes.push(`title: "${product.title}" → "${opt.title_suggested}"`);
      } catch (e) {
        result.errors.push(`title update failed: ${(e as Error).message}`);
      }
    }
  } else if (!fields.includes('title')) {
    result.skipped.push('title');
  }

  // ── 2. Description ──────────────────────────────────────────
  if (fields.includes('description') && opt.description_html_suggested !== product.descriptionHtml) {
    if (dryRun) {
      result.changes.push('[DRY] descriptionHtml: actualizada');
    } else {
      try {
        await updateProduct({ id: product.id, descriptionHtml: opt.description_html_suggested });
        result.changes.push('descriptionHtml: actualizada');
      } catch (e) {
        result.errors.push(`description update failed: ${(e as Error).message}`);
      }
    }
  } else if (!fields.includes('description')) {
    result.skipped.push('description');
  }

  // ── 3. SEO ──────────────────────────────────────────────────
  if (fields.includes('seo')) {
    const seoChanged =
      opt.seo_title !== product.seo.title ||
      opt.seo_description !== product.seo.description;

    if (seoChanged) {
      if (dryRun) {
        result.changes.push(`[DRY] seo.title: "${product.seo.title}" → "${opt.seo_title}"`);
        result.changes.push(`[DRY] seo.description: "${product.seo.description}" → "${opt.seo_description}"`);
      } else {
        try {
          await updateProduct({
            id: product.id,
            seo: { title: opt.seo_title, description: opt.seo_description },
          });
          result.changes.push('seo.title y seo.description actualizados');
        } catch (e) {
          result.errors.push(`SEO update failed: ${(e as Error).message}`);
        }
      }
    }
  } else {
    result.skipped.push('seo');
  }

  // ── 4. Tags ─────────────────────────────────────────────────
  if (fields.includes('tags') && opt.tags_suggested.length > 0) {
    if (dryRun) {
      result.changes.push(`[DRY] tags: ${opt.tags_suggested.join(', ')}`);
    } else {
      try {
        await updateProduct({ id: product.id, tags: opt.tags_suggested });
        result.changes.push(`tags actualizados: ${opt.tags_suggested.join(', ')}`);
      } catch (e) {
        result.errors.push(`tags update failed: ${(e as Error).message}`);
      }
    }
  } else if (!fields.includes('tags')) {
    result.skipped.push('tags');
  }

  // ── 5. ALT Texts ────────────────────────────────────────────
  if (fields.includes('alt_texts') && opt.alt_texts.length > 0) {
    const mediaUpdates = product.media
      .map((m, i) => ({ id: m.id, alt: opt.alt_texts[i] ?? m.alt }))
      .filter((u, i) => u.alt !== product.media[i].alt);

    if (mediaUpdates.length > 0) {
      if (dryRun) {
        result.changes.push(`[DRY] ALT texts actualizados en ${mediaUpdates.length} imagen(es)`);
      } else {
        try {
          await updateProductMediaAlt(product.id, mediaUpdates);
          result.changes.push(`ALT texts actualizados en ${mediaUpdates.length} imagen(es)`);
        } catch (e) {
          result.errors.push(`alt_text update failed: ${(e as Error).message}`);
        }
      }
    }
  } else if (!fields.includes('alt_texts')) {
    result.skipped.push('alt_texts');
  }

  // ── 6. Images ───────────────────────────────────────────────
  if (fields.includes('images') && backup.imageResults && backup.imageResults.length > 0) {
    for (const imgResult of backup.imageResults) {
      if (!existsSync(imgResult.optimizedPath)) {
        result.skipped.push(`image ${imgResult.newFilename} (archivo no encontrado)`);
        continue;
      }

      const altIndex = product.media.findIndex(m => m.id === imgResult.mediaId);
      const alt = opt.alt_texts[altIndex] ?? '';

      if (dryRun) {
        result.changes.push(`[DRY] imagen "${imgResult.newFilename}" reemplazaría a la original`);
      } else {
        try {
          await uploadOptimizedImage(imgResult.optimizedPath, product.id, alt);
          if (imgResult.mediaId) {
            await deleteProductMedia(product.id, [imgResult.mediaId]);
          }
          result.changes.push(`imagen "${imgResult.newFilename}" reemplazada en Shopify`);
        } catch (e) {
          result.errors.push(`image replace failed (${imgResult.newFilename}): ${(e as Error).message}`);
        }
      }
    }
  } else if (!fields.includes('images')) {
    result.skipped.push('images');
  }

  result.success = result.errors.length === 0;
  return result;
}

export async function runApply(options?: ApplyOptions): Promise<void> {
  const opts = options ?? parseArgs();
  const fields = opts.fields ?? ALL_FIELDS;
  const dryRun = opts.dryRun ?? false;

  logger.separator();
  logger.info(dryRun ? 'Modo DRY RUN — no se harán cambios en Shopify' : 'Aplicando cambios a Shopify...');
  logger.info(`Campos a aplicar: ${fields.join(', ')}`);

  const preview = loadLatestPreview();
  const targets = opts.handles
    ? preview.filter(r => opts.handles!.includes(r.handle))
    : preview;

  logger.info(`Productos a procesar: ${targets.length}`);
  logger.separator();

  const results: ApplyResult[] = [];

  for (let i = 0; i < targets.length; i++) {
    const record = targets[i];
    logger.progress(i + 1, targets.length, record.handle);

    const backup = loadLatestBackupForProduct(record.handle);
    if (!backup) {
      logger.error(`No se encontró backup para "${record.handle}" — omitido`);
      results.push({
        productId: record.product_id,
        handle: record.handle,
        success: false,
        changes: [],
        errors: ['Backup no encontrado'],
        skipped: [],
      });
      continue;
    }

    try {
      const result = await applyRecord(record, backup, fields, dryRun);
      results.push(result);

      if (result.success) {
        logger.success(`${record.handle}: ${result.changes.length} cambio(s) aplicado(s)`, record.handle);
        result.changes.forEach(c => logger.info(`  ✓ ${c}`, record.handle));
      } else {
        logger.warn(`${record.handle}: completado con errores`, record.handle);
        result.errors.forEach(e => logger.error(`  ✗ ${e}`, record.handle));
      }
    } catch (err) {
      logger.error(`Error inesperado en "${record.handle}": ${(err as Error).message}`);
      results.push({
        productId: record.product_id,
        handle: record.handle,
        success: false,
        changes: [],
        errors: [(err as Error).message],
        skipped: [],
      });
    }
  }

  // ── Summary ──────────────────────────────────────────────────
  logger.separator();
  const ok = results.filter(r => r.success).length;
  const fail = results.filter(r => !r.success).length;
  logger.info(`Resultado: ${ok} exitosos / ${fail} con errores / ${results.length} total`);

  if (fail > 0) {
    logger.warn('Productos con errores:');
    results.filter(r => !r.success).forEach(r => {
      logger.error(`  ${r.handle}: ${r.errors.join('; ')}`);
    });
  }
}
