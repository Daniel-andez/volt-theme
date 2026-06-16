import type { ClaudeOptimization } from '../types/index.js';

export function validateClaudeResponse(data: unknown): asserts data is ClaudeOptimization {
  if (!data || typeof data !== 'object') {
    throw new Error('La respuesta de Claude no es un objeto válido');
  }

  const obj = data as Record<string, unknown>;

  const requiredStrings: Array<keyof ClaudeOptimization> = [
    'title_suggested',
    'description_html_suggested',
    'seo_title',
    'seo_description',
    'collection_notes',
    'risk_notes',
  ];

  const requiredArrays: Array<keyof ClaudeOptimization> = [
    'tags_suggested',
    'alt_texts',
    'color_name_suggestions',
  ];

  for (const key of requiredStrings) {
    if (typeof obj[key] !== 'string') {
      throw new Error(`Campo requerido faltante o inválido en respuesta Claude: ${key}`);
    }
  }

  for (const key of requiredArrays) {
    if (!Array.isArray(obj[key])) {
      throw new Error(`Campo array requerido faltante en respuesta Claude: ${key}`);
    }
  }

  const seoTitle = obj.seo_title as string;
  if (seoTitle.length > 70) {
    // Warn but don't throw — Claude may be slightly off; we truncate elsewhere
    console.warn(`[validator] seo_title supera 60 chars: ${seoTitle.length} chars`);
  }

  const seoDesc = obj.seo_description as string;
  if (seoDesc.length > 175) {
    console.warn(`[validator] seo_description supera 160 chars: ${seoDesc.length} chars`);
  }
}

export function parseClaudeJSON(raw: string): ClaudeOptimization {
  let text = raw.trim();

  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  // Find the first { and last } to extract JSON object
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('No se encontró JSON válido en la respuesta de Claude');
  }
  text = text.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON inválido de Claude: ${(e as Error).message}`);
  }

  validateClaudeResponse(parsed);
  return parsed;
}
