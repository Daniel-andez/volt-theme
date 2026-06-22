import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { config } from '../config/env.js';
import { logger, initLogger } from '../utils/logger.js';
import { timestamp } from '../utils/helpers.js';
import { fetchAllProducts, fetchProductByHandle } from '../api/shopify-queries.js';
import { auditAllProducts, formatAuditSummary } from '../modules/audit.js';
import type { ShopifyProduct } from '../types/index.js';

async function main() {
  initLogger('audit');
  logger.separator();
  logger.info(`${config.brand.name} — Product Optimizer`);
  logger.info('Modo: AUDIT');
  logger.separator();

  let products: ShopifyProduct[];

  // Support targeted audit via env vars or CLI args
  const handleArgs = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const targetHandles = handleArgs.length > 0
    ? handleArgs
    : config.targets.handles;

  if (targetHandles.length > 0) {
    logger.info(`Auditando handles específicos: ${targetHandles.join(', ')}`);
    products = (
      await Promise.all(targetHandles.map(h => fetchProductByHandle(h)))
    ).filter((p): p is ShopifyProduct => p !== null);
  } else if (config.targets.productIds.length > 0) {
    const { fetchProductById } = await import('../api/shopify-queries.js');
    logger.info(`Auditando IDs específicos: ${config.targets.productIds.join(', ')}`);
    products = (
      await Promise.all(config.targets.productIds.map(id => fetchProductById(id)))
    ).filter((p): p is ShopifyProduct => p !== null);
  } else {
    products = await fetchAllProducts();
  }

  if (products.length === 0) {
    logger.warn('No se encontraron productos para auditar.');
    process.exit(0);
  }

  logger.info(`Auditando ${products.length} productos...`);
  const results = auditAllProducts(products);

  // Print summary
  console.log(formatAuditSummary(results));

  // Print per-product issues (critical and warnings only)
  results
    .filter(r => r.issues.length > 0)
    .sort((a, b) => a.score - b.score)
    .forEach(r => {
      logger.separator();
      const criticals = r.issues.filter(i => i.severity === 'critical').length;
      const warnings = r.issues.filter(i => i.severity === 'warning').length;
      logger.warn(`[${r.score}/100] ${r.product.handle} — ${criticals} críticos, ${warnings} advertencias`);
      r.issues.forEach(issue => {
        const icon = issue.severity === 'critical' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ';
        logger.info(`  ${icon} ${issue.message}`);
      });
    });

  // Save audit results
  mkdirSync(config.output.dir, { recursive: true });
  const ts = timestamp();
  const auditPath = resolve(config.output.dir, `audit-${ts}.json`);
  writeFileSync(auditPath, JSON.stringify(results, null, 2), 'utf-8');

  logger.separator();
  logger.success(`Auditoría guardada en: ${auditPath}`);
  logger.info('Ejecuta "npm run preview" para generar optimizaciones con IA.');
}

main().catch(err => {
  logger.error(`Error fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
