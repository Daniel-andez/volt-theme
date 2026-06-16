import { createWriteStream, mkdirSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import sharp from 'sharp';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { slugify, formatBytes } from '../utils/helpers.js';
import type { ShopifyProduct, ShopifyMedia, ImageProcessingResult } from '../types/index.js';

const MAX_SIDE_PX = 2048;
const TARGET_QUALITY = 85;
const TARGET_BYTES = 450 * 1024; // 450 KB goal

function ensureDirs() {
  mkdirSync(config.output.imagesOriginalDir, { recursive: true });
  mkdirSync(config.output.imagesOptimizedDir, { recursive: true });
}

function buildFilename(
  product: ShopifyProduct,
  mediaIndex: number,
  ext: string
): string {
  const nameSlug = slugify(product.title).slice(0, 50);
  const colorOption = product.options.find(o =>
    ['color', 'colour', 'tono'].includes(o.name.toLowerCase())
  );
  const colorSlug = colorOption?.values[0] ? '-' + slugify(colorOption.values[0]) : '';
  const typeSlug = product.productType ? '-' + slugify(product.productType) : '';
  const idx = mediaIndex === 0 ? '' : `-${mediaIndex + 1}`;
  return `anarias-${nameSlug}${colorSlug}${typeSlug}${idx}.${ext}`;
}

async function downloadImage(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar imagen: ${url}`);
  const body = res.body;
  if (!body) throw new Error('Respuesta vacía al descargar imagen');
  await pipeline(Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(destPath));
}

async function processImage(srcPath: string, destPath: string): Promise<{ width: number; height: number; size: number }> {
  const image = sharp(srcPath);
  const meta = await image.metadata();

  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const needsResize = w > MAX_SIDE_PX || h > MAX_SIDE_PX;

  let pipeline = image.clone();

  if (needsResize) {
    pipeline = pipeline.resize(MAX_SIDE_PX, MAX_SIDE_PX, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Try WebP at target quality
  await pipeline
    .webp({ quality: TARGET_QUALITY, effort: 4 })
    .toFile(destPath);

  const stats = statSync(destPath);

  // If still too large, recompress at lower quality
  if (stats.size > TARGET_BYTES * 1.5) {
    const reduced = Math.max(65, TARGET_QUALITY - 15);
    await sharp(srcPath)
      .resize(MAX_SIDE_PX, MAX_SIDE_PX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: reduced, effort: 5 })
      .toFile(destPath);
  }

  const finalStats = statSync(destPath);
  const finalMeta = await sharp(destPath).metadata();

  return {
    width: finalMeta.width ?? w,
    height: finalMeta.height ?? h,
    size: finalStats.size,
  };
}

export async function processProductImages(
  product: ShopifyProduct
): Promise<ImageProcessingResult[]> {
  ensureDirs();

  const results: ImageProcessingResult[] = [];

  for (let i = 0; i < product.media.length; i++) {
    const media: ShopifyMedia = product.media[i];
    if (!media.image?.url) continue;

    const productIdShort = product.id.split('/').pop() ?? 'unknown';
    const origFilename = buildFilename(product, i, 'jpg');
    const optFilename = buildFilename(product, i, 'webp');

    const origPath = resolve(config.output.imagesOriginalDir, `${productIdShort}-${origFilename}`);
    const optPath = resolve(config.output.imagesOptimizedDir, `${productIdShort}-${optFilename}`);

    try {
      // Download original (skip if already cached)
      if (!existsSync(origPath)) {
        logger.debug(`Descargando imagen ${i + 1}/${product.media.length}`, product.handle);
        await downloadImage(media.image.url, origPath);
      }

      const origSize = statSync(origPath).size;

      // Process to WebP
      logger.debug(`Optimizando imagen ${i + 1}/${product.media.length}`, product.handle);
      const { width, height, size: optSize } = await processImage(origPath, optPath);

      const savingsPct = origSize > 0 ? ((origSize - optSize) / origSize) * 100 : 0;

      results.push({
        productId: product.id,
        mediaId: media.id,
        originalUrl: media.image.url,
        originalPath: origPath,
        originalSize: origSize,
        optimizedPath: optPath,
        optimizedSize: optSize,
        savingsPercentage: Math.round(savingsPct * 10) / 10,
        newFilename: optFilename,
        width,
        height,
      });

      logger.info(
        `Imagen ${i + 1}: ${formatBytes(origSize)} → ${formatBytes(optSize)} (-${Math.round(savingsPct)}%)`,
        product.handle
      );
    } catch (err) {
      logger.error(`Error procesando imagen ${i + 1}: ${(err as Error).message}`, product.handle);
    }
  }

  return results;
}

export async function uploadOptimizedImage(
  optimizedPath: string,
  productId: string,
  alt: string
): Promise<string> {
  const { readFileSync } = await import('fs');
  const { createStagedUpload, addProductMedia } = await import('../api/shopify-mutations.js');

  const filename = optimizedPath.split('/').pop() ?? 'image.webp';
  const buffer = readFileSync(optimizedPath);
  const fileSize = buffer.length;

  // 1. Request staged upload URL from Shopify
  const staged = await createStagedUpload(filename, 'image/webp', fileSize);

  // 2. Upload to the staged URL (multipart/form-data)
  const form = new FormData();
  staged.parameters.forEach(p => form.append(p.name, p.value));
  form.append('file', new Blob([buffer], { type: 'image/webp' }), filename);

  const uploadRes = await fetch(staged.url, { method: 'POST', body: form });
  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => '');
    throw new Error(`Upload a staged URL falló (${uploadRes.status}): ${text.slice(0, 200)}`);
  }

  // 3. Attach to product
  await addProductMedia(productId, staged.resourceUrl, alt);

  return staged.resourceUrl;
}
