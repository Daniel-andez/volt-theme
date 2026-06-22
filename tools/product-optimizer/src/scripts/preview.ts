import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from '../config/env.js';
import { logger, initLogger } from '../utils/logger.js';
import { latestFile } from '../utils/helpers.js';
import { fetchAllProducts, fetchProductByHandle } from '../api/shopify-queries.js';
import { auditAllProducts } from '../modules/audit.js';
import { generatePreview } from '../modules/preview.js';
import type { AuditResult, ShopifyProduct } from '../types/index.js';

async function loadOrRunAudit(targetHandles: string[]): Promise<AuditResult[]> {
  // Check if a recent audit JSON exists (from today)
  const today = new Date().toISOString().slice(0, 10);
  const auditFiles = readdirSync(config.output.dir)
    .filter(f => f.startsWith(`audit-${today}`) && f.endsWith('.json'));

  const latestAudit = latestFile(auditFiles);

  if (latestAudit && targetHandles.length === 0) {
    const path = resolve(config.output.dir, latestAudit);
    logger.info(`Usando auditoría existente: ${latestAudit}`);
    const results = JSON.parse(readFileSync(path, 'utf-8')) as AuditResult[];
    return results;
  }

  // Re-run audit
  logger.info('Ejecutando auditoría fresca...');
  let products: ShopifyProduct[];

  if (targetHandles.length > 0) {
    products = (
      await Promise.all(targetHandles.map(h => fetchProductByHandle(h)))
    ).filter((p): p is ShopifyProduct => p !== null);
  } else {
    products = await fetchAllProducts('status:active');
  }

  return auditAllProducts(products);
}

async function main() {
  initLogger('preview');
  logger.separator();
  logger.info(`${config.brand.name} — Product Optimizer`);
  logger.info('Modo: PREVIEW');
  logger.separator();

  const handleArgs = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const targetHandles = handleArgs.length > 0 ? handleArgs : config.targets.handles;

  const auditResults = await loadOrRunAudit(targetHandles);

  if (auditResults.length === 0) {
    logger.warn('No hay productos para procesar.');
    process.exit(0);
  }

  // Filter if target handles specified
  const filtered = (targetHandles.length > 0
    ? auditResults.filter(r => targetHandles.includes(r.product.handle))
    : auditResults
  ).filter(r => r.product.status === 'ACTIVE');

  logger.info(`Generando preview para ${filtered.length} productos...`);
  logger.info('Esto puede tomar varios minutos (Claude + procesamiento de imágenes).');
  logger.separator();

  await generatePreview(filtered);
}

main().catch(err => {
  logger.error(`Error fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
