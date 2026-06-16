import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { formatBytes, stripHtml, timestamp, latestFile } from '../utils/helpers.js';
import { writePreviewCSV } from '../utils/csv-writer.js';
import { optimizeProductWithClaude } from '../api/claude-client.js';
import { processProductImages } from './images.js';
import type {
  AuditResult,
  ClaudeOptimization,
  ImageProcessingResult,
  PreviewRecord,
  ProductBackup,
} from '../types/index.js';

function determineRiskLevel(
  opt: ClaudeOptimization,
  audit: AuditResult
): PreviewRecord['risk_level'] {
  const riskText = (opt.risk_notes ?? '').toLowerCase();
  const hasCriticals = audit.issues.some(i => i.severity === 'critical');
  const titleChanged = opt.title_suggested.toLowerCase() !== audit.product.title.toLowerCase();

  if (riskText.includes('renombrar') || riskText.includes('cambiar nombre') || (titleChanged && riskText.length > 20)) {
    return 'high';
  }
  if (hasCriticals || riskText.includes('revisar') || riskText.includes('verificar')) {
    return 'medium';
  }
  return 'low';
}

export async function generatePreview(auditResults: AuditResult[]): Promise<void> {
  mkdirSync(config.output.previewsDir, { recursive: true });

  const records: PreviewRecord[] = [];
  const backups: ProductBackup[] = [];
  const ts = timestamp();

  logger.info(`Generando preview para ${auditResults.length} productos...`);

  for (let i = 0; i < auditResults.length; i++) {
    const { product, issues, score } = auditResults[i];
    logger.progress(i + 1, auditResults.length, product.handle);

    let opt: ClaudeOptimization;
    let imageResults: ImageProcessingResult[] = [];

    // ── Claude optimization ──────────────────────────────────────
    try {
      opt = await optimizeProductWithClaude(product);
    } catch (err) {
      logger.error(`Claude falló para "${product.handle}": ${(err as Error).message}`);
      // Use a fallback with current values to avoid blocking the whole preview
      opt = {
        title_suggested: product.title,
        description_html_suggested: product.descriptionHtml,
        seo_title: product.seo.title,
        seo_description: product.seo.description,
        tags_suggested: product.tags,
        alt_texts: product.media.map(m => m.alt),
        color_name_suggestions: [],
        collection_notes: '',
        risk_notes: `[ERROR] Claude no pudo procesar este producto: ${(err as Error).message}`,
      };
    }

    // ── Image processing ─────────────────────────────────────────
    try {
      imageResults = await processProductImages(product);
    } catch (err) {
      logger.warn(`Procesamiento de imágenes falló para "${product.handle}": ${(err as Error).message}`);
    }

    // ── Build preview record ─────────────────────────────────────
    const firstImg = imageResults[0];
    const totalOrigBytes = imageResults.reduce((a, r) => a + r.originalSize, 0);
    const totalOptBytes = imageResults.reduce((a, r) => a + r.optimizedSize, 0);
    const totalSavings = totalOrigBytes > 0
      ? Math.round(((totalOrigBytes - totalOptBytes) / totalOrigBytes) * 1000) / 10
      : 0;

    const record: PreviewRecord = {
      product_id: product.id,
      handle: product.handle,
      status: product.status,
      title_actual: product.title,
      title_suggested: opt.title_suggested,
      seo_title_actual: product.seo.title,
      seo_title_suggested: opt.seo_title,
      seo_description_actual: product.seo.description,
      seo_description_suggested: opt.seo_description,
      description_actual: stripHtml(product.descriptionHtml).slice(0, 200),
      description_suggested: stripHtml(opt.description_html_suggested).slice(0, 200),
      alt_actual: product.media.map(m => m.alt || '(vacío)').join(' | '),
      alt_suggested: opt.alt_texts.join(' | '),
      image_original_size: totalOrigBytes > 0 ? formatBytes(totalOrigBytes) : 'N/A',
      image_optimized_size: totalOptBytes > 0 ? formatBytes(totalOptBytes) : 'N/A',
      image_savings_percentage: totalOrigBytes > 0 ? `${totalSavings}%` : 'N/A',
      tags_actual: product.tags.join(', '),
      tags_suggested: opt.tags_suggested.join(', '),
      color_suggestions: opt.color_name_suggestions.join(', '),
      collection_notes: opt.collection_notes,
      notes: issues.map(i => i.message).join(' | '),
      risk_level: determineRiskLevel(opt, auditResults[i]),
      audit_score: String(score),
      audit_issues: issues.map(i => `[${i.severity.toUpperCase()}] ${i.type}`).join(' | '),
    };

    records.push(record);

    // ── Backup ───────────────────────────────────────────────────
    const backup: ProductBackup = {
      timestamp: new Date().toISOString(),
      product,
      auditResult: auditResults[i],
      optimization: opt,
      imageResults,
    };
    backups.push(backup);

    // Write individual product backup
    mkdirSync(config.output.backupsDir, { recursive: true });
    const backupPath = resolve(
      config.output.backupsDir,
      `${ts}-${product.handle}.json`
    );
    writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf-8');
  }

  // ── Write batch preview files ────────────────────────────────
  const previewJsonPath = resolve(config.output.previewsDir, `preview-${ts}.json`);
  const previewCsvPath = resolve(config.output.previewsDir, `preview-${ts}.csv`);

  writeFileSync(previewJsonPath, JSON.stringify(records, null, 2), 'utf-8');
  writePreviewCSV(records, previewCsvPath);

  logger.separator();
  logger.success(`Preview JSON: ${previewJsonPath}`);
  logger.success(`Preview CSV : ${previewCsvPath}`);
  logger.info('Revisa los archivos y ejecuta "npm run apply" cuando estés lista.');
}

export function loadLatestPreview(): PreviewRecord[] {
  const files = readdirSync(config.output.previewsDir)
    .filter(f => f.startsWith('preview-') && f.endsWith('.json'));

  const latest = latestFile(files);
  if (!latest) throw new Error('No se encontró ningún archivo de preview. Ejecuta primero "npm run preview".');

  const path = resolve(config.output.previewsDir, latest);
  logger.info(`Cargando preview: ${path}`);
  return JSON.parse(readFileSync(path, 'utf-8')) as PreviewRecord[];
}

export function loadLatestBackupForProduct(handle: string): ProductBackup | null {
  const files = readdirSync(config.output.backupsDir)
    .filter(f => f.endsWith(`-${handle}.json`))
    .sort();

  const latest = files.at(-1);
  if (!latest) return null;

  const path = resolve(config.output.backupsDir, latest);
  return JSON.parse(readFileSync(path, 'utf-8')) as ProductBackup;
}
