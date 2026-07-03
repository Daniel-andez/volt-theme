import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import { logger, initLogger } from '../utils/logger.js';
import { fetchAllProducts } from '../api/shopify-queries.js';
import { config } from '../config/env.js';

async function main() {
  initLogger('handles');
  logger.separator();
  logger.info(`${config.brand.name} — Lista de productos (título → handle)`);
  logger.separator();

  // Filtro opcional por texto: npm run handles -- camisa
  const filterText = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ').toLowerCase();

  const products = await fetchAllProducts('status:active OR status:draft');
  const sorted = [...products].sort((a, b) => a.title.localeCompare(b.title));

  let shown = 0;
  for (const p of sorted) {
    if (filterText && !p.title.toLowerCase().includes(filterText) && !p.handle.includes(filterText)) continue;
    const estado = p.status === 'ACTIVE' ? 'Activo  ' : p.status === 'DRAFT' ? 'Borrador' : p.status;
    logger.info(`[${estado}] ${p.title}  →  ${p.handle}`);
    shown++;
  }

  logger.separator();
  logger.info(`Total: ${shown} producto(s)`);
  logger.info('Copia los handles (lo que va después de "→") para usarlos en preview/apply.');
}

main().catch(err => {
  logger.error(`Error fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
