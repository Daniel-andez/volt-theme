import { logger, initLogger } from '../utils/logger.js';
import { runApply } from '../modules/apply.js';

async function main() {
  initLogger('apply');
  logger.separator();
  logger.info('ANARIAS Atelier — Product Optimizer');
  logger.info('Modo: APPLY');
  logger.info('');
  logger.info('Flags disponibles:');
  logger.info('  --dry-run            Simula cambios sin escribir en Shopify');
  logger.info('  --handles=h1,h2      Aplica solo a estos handles');
  logger.info('  --fields=seo,tags    Aplica solo estos campos');
  logger.info('  Campos: title, description, seo, tags, alt_texts, images');
  logger.separator();

  await runApply();
}

main().catch(err => {
  logger.error(`Error fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
