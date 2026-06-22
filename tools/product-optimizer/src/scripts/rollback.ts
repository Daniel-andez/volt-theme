import { logger, initLogger } from '../utils/logger.js';
import { runRollback } from '../modules/rollback.js';
import { config } from '../config/env.js';

async function main() {
  initLogger('rollback');
  logger.separator();
  logger.info(`${config.brand.name} — Product Optimizer`);
  logger.info('Modo: ROLLBACK');
  logger.info('');
  logger.info('Flags disponibles:');
  logger.info('  --dry-run                  Simula el rollback sin cambios reales');
  logger.info('  --handles=h1,h2            Revierte solo estos handles');
  logger.info('  --timestamp=2024-01-15T10  Usa backups de este timestamp');
  logger.separator();

  await runRollback();
}

main().catch(err => {
  logger.error(`Error fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
