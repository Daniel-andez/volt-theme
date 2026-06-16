import { jaccardSimilarity, stripHtml } from '../utils/helpers.js';
import type { ShopifyProduct, AuditResult, AuditIssue, AuditIssueType } from '../types/index.js';

const SEO_TITLE_MAX = 60;
const SEO_DESC_MAX = 160;
const DESCRIPTION_MIN_CHARS = 100;
const DUPLICATE_THRESHOLD = 0.72;
const IMAGE_LARGE_SIDE_PX = 4000;

// Known generic color naming patterns to flag inconsistency
const ES_COLORS = ['negro', 'blanco', 'rojo', 'azul', 'verde', 'gris', 'beige', 'crema', 'nude', 'cafe', 'café', 'rosa', 'amarillo', 'naranja', 'lila', 'morado'];
const EN_COLORS = ['black', 'white', 'red', 'blue', 'green', 'gray', 'grey', 'brown', 'pink', 'yellow', 'orange', 'purple', 'lavender'];

function issue(
  type: AuditIssueType,
  severity: AuditIssue['severity'],
  message: string,
  field?: string,
  value?: string
): AuditIssue {
  return { type, severity, message, field, value };
}

function detectColorInconsistency(values: string[]): boolean {
  if (values.length < 2) return false;
  const lower = values.map(v => v.toLowerCase());

  // Mixed case: some ALL_CAPS, some Title Case, some lower
  const hasCaps = lower.some((_, i) => values[i] === values[i].toUpperCase() && /[A-Z]/.test(values[i]));
  const hasLower = lower.some((v, i) => values[i] === values[i].toLowerCase() && /[a-z]/.test(values[i]));

  // Mixed language
  const hasEs = lower.some(v => ES_COLORS.some(c => v.includes(c)));
  const hasEn = lower.some(v => EN_COLORS.some(c => v.includes(c)));

  return (hasCaps && hasLower) || (hasEs && hasEn);
}

export function auditProduct(
  product: ShopifyProduct,
  allProducts: ShopifyProduct[]
): AuditResult {
  const issues: AuditIssue[] = [];

  // ── SEO Title ──────────────────────────────────────────────────
  if (!product.seo.title || product.seo.title.trim() === '') {
    issues.push(issue('SEO_TITLE_MISSING', 'critical', 'Meta title vacío', 'seo.title'));
  } else if (product.seo.title.length > SEO_TITLE_MAX) {
    issues.push(issue(
      'SEO_TITLE_TOO_LONG', 'warning',
      `Meta title: ${product.seo.title.length} chars (máx ${SEO_TITLE_MAX})`,
      'seo.title', product.seo.title
    ));
  }

  // ── SEO Description ───────────────────────────────────────────
  if (!product.seo.description || product.seo.description.trim() === '') {
    issues.push(issue('SEO_DESCRIPTION_MISSING', 'critical', 'Meta description vacía', 'seo.description'));
  } else if (product.seo.description.length > SEO_DESC_MAX) {
    issues.push(issue(
      'SEO_DESCRIPTION_TOO_LONG', 'warning',
      `Meta description: ${product.seo.description.length} chars (máx ${SEO_DESC_MAX})`,
      'seo.description', product.seo.description
    ));
  }

  // ── Description ───────────────────────────────────────────────
  if (!product.descriptionHtml || product.descriptionHtml.trim() === '') {
    issues.push(issue('DESCRIPTION_MISSING', 'critical', 'Producto sin descripción', 'descriptionHtml'));
  } else {
    const plainText = stripHtml(product.descriptionHtml);
    if (plainText.length < DESCRIPTION_MIN_CHARS) {
      issues.push(issue(
        'DESCRIPTION_TOO_SHORT', 'warning',
        `Descripción muy corta: ${plainText.length} chars (mínimo ${DESCRIPTION_MIN_CHARS})`,
        'descriptionHtml'
      ));
    }
  }

  // ── Images ────────────────────────────────────────────────────
  if (product.media.length === 0) {
    issues.push(issue('IMAGE_MISSING', 'critical', 'Producto sin imágenes', 'media'));
  } else {
    const noAlt = product.media.filter(m => !m.alt || m.alt.trim() === '');
    if (noAlt.length > 0) {
      issues.push(issue(
        'ALT_TEXT_MISSING', 'warning',
        `${noAlt.length} de ${product.media.length} imagen(es) sin ALT text`,
        'media.alt'
      ));
    }

    const oversized = product.media.filter(m => {
      const maxSide = Math.max(m.image.width ?? 0, m.image.height ?? 0);
      return maxSide > IMAGE_LARGE_SIDE_PX;
    });
    if (oversized.length > 0) {
      issues.push(issue(
        'IMAGE_OVERSIZED', 'info',
        `${oversized.length} imagen(es) con lado mayor a ${IMAGE_LARGE_SIDE_PX}px`,
        'media.image'
      ));
    }
  }

  // ── Color naming ──────────────────────────────────────────────
  const colorOption = product.options.find(o =>
    ['color', 'colour', 'tono', 'color/tono'].includes(o.name.toLowerCase())
  );
  if (colorOption && detectColorInconsistency(colorOption.values)) {
    issues.push(issue(
      'COLOR_NAME_INCONSISTENT', 'info',
      `Nombres de color inconsistentes: ${colorOption.values.join(' | ')}`,
      'options.color', colorOption.values.join(', ')
    ));
  }

  // ── Stock ─────────────────────────────────────────────────────
  if (product.status === 'ACTIVE' && product.variants.length > 0) {
    const allOutOfStock = product.variants.every(v => (v.inventoryQuantity ?? 0) <= 0);
    if (allOutOfStock) {
      issues.push(issue(
        'OUT_OF_STOCK_VISIBLE', 'warning',
        'Producto activo sin stock en ninguna variante',
        'variants.inventoryQuantity'
      ));
    }
  }

  // ── Duplicate detection ───────────────────────────────────────
  for (const other of allProducts) {
    if (other.id === product.id) continue;
    const sim = jaccardSimilarity(product.title, other.title);
    if (sim >= DUPLICATE_THRESHOLD) {
      issues.push(issue(
        'DUPLICATE_PRODUCT', 'warning',
        `Posible duplicado con "${other.title}" (similitud ${Math.round(sim * 100)}%)`,
        'title', other.handle
      ));
      break;
    }
  }

  // ── Score ─────────────────────────────────────────────────────
  const criticals = issues.filter(i => i.severity === 'critical').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const infos = issues.filter(i => i.severity === 'info').length;
  const score = Math.max(0, 100 - criticals * 20 - warnings * 8 - infos * 3);

  return {
    product,
    issues,
    score,
    auditedAt: new Date().toISOString(),
  };
}

export function auditAllProducts(products: ShopifyProduct[]): AuditResult[] {
  return products.map(p => auditProduct(p, products));
}

export function formatAuditSummary(results: AuditResult[]): string {
  const total = results.length;
  const critical = results.filter(r => r.issues.some(i => i.severity === 'critical')).length;
  const warnings = results.filter(r => r.issues.some(i => i.severity === 'warning')).length;
  const clean = results.filter(r => r.issues.length === 0).length;
  const avgScore = Math.round(results.reduce((acc, r) => acc + r.score, 0) / total);

  const lines = [
    ``,
    `  RESUMEN DE AUDITORÍA — ANARIAS Atelier`,
    `  ─────────────────────────────────────`,
    `  Productos analizados : ${total}`,
    `  Con issues críticos  : ${critical}`,
    `  Con advertencias     : ${warnings}`,
    `  Sin problemas        : ${clean}`,
    `  Score promedio       : ${avgScore}/100`,
    ``,
  ];

  // Top issues by type
  const issueCount: Partial<Record<string, number>> = {};
  results.forEach(r => r.issues.forEach(i => {
    issueCount[i.type] = (issueCount[i.type] ?? 0) + 1;
  }));

  const sorted = Object.entries(issueCount).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  if (sorted.length > 0) {
    lines.push('  Issues más frecuentes:');
    sorted.slice(0, 6).forEach(([type, count]) => {
      lines.push(`    ${(count ?? 0).toString().padStart(3, ' ')}x  ${type}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}
