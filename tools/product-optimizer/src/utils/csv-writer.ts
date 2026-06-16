import { writeFileSync } from 'fs';
import type { PreviewRecord } from '../types/index.js';

function escapeCsvField(value: string): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const CSV_HEADERS: Array<keyof PreviewRecord> = [
  'product_id',
  'handle',
  'status',
  'risk_level',
  'audit_score',
  'audit_issues',
  'title_actual',
  'title_suggested',
  'seo_title_actual',
  'seo_title_suggested',
  'seo_description_actual',
  'seo_description_suggested',
  'description_actual',
  'description_suggested',
  'alt_actual',
  'alt_suggested',
  'image_original_size',
  'image_optimized_size',
  'image_savings_percentage',
  'tags_actual',
  'tags_suggested',
  'color_suggestions',
  'collection_notes',
  'notes',
];

export function writePreviewCSV(records: PreviewRecord[], outputPath: string): void {
  const header = CSV_HEADERS.map(h => escapeCsvField(h)).join(',');
  const rows = records.map(record =>
    CSV_HEADERS.map(key => escapeCsvField(record[key] ?? '')).join(',')
  );
  const csv = [header, ...rows].join('\n');
  writeFileSync(outputPath, '﻿' + csv, 'utf-8'); // BOM for Excel compatibility
}

export function generateExampleCSV(): string {
  const example: PreviewRecord = {
    product_id: 'gid://shopify/Product/123456789',
    handle: 'camisa-oxford-blanca',
    status: 'ACTIVE',
    risk_level: 'low',
    audit_score: '75',
    audit_issues: 'SEO_TITLE_MISSING | ALT_TEXT_MISSING (2 imágenes)',
    title_actual: 'Camisa Oxford',
    title_suggested: 'Camisa Oxford Blanca — ANARIAS Atelier',
    seo_title_actual: '',
    seo_title_suggested: 'Camisa Oxford Blanca | ANARIAS Atelier',
    seo_description_actual: '',
    seo_description_suggested: 'Camisa de corte recto en popelina de algodón. Cuello italiano y puño sastre. Una pieza esencial de la colección.',
    description_actual: '<p>Camisa blanca.</p>',
    description_suggested: '<p>De silueta recta y caída impecable, esta camisa en popelina de algodón define el equilibrio entre lo estructurado y lo cotidiano. Cuello italiano, puño sastre con botón de nácar.</p>',
    alt_actual: '',
    alt_suggested: 'Camisa oxford blanca ANARIAS Atelier — vista frontal',
    image_original_size: '1.2 MB',
    image_optimized_size: '320 KB',
    image_savings_percentage: '73.7%',
    tags_actual: 'camisa, blanco',
    tags_suggested: 'camisa, oxford, blanco, algodón, básico, esencial, colección',
    color_suggestions: 'Blanco Óptico',
    collection_notes: 'Considerar incluir en "Básicos Esenciales" y "Camisas"',
    notes: 'Descripción muy corta. Sin meta SEO. Sin ALT en imágenes.',
  };
  return [
    CSV_HEADERS.join(','),
    CSV_HEADERS.map(k => escapeCsvField(example[k] ?? '')).join(','),
  ].join('\n');
}
