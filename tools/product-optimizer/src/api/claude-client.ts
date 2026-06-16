import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';
import { parseClaudeJSON } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/helpers.js';
import type { ShopifyProduct, ClaudeOptimization } from '../types/index.js';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const SYSTEM_PROMPT = `Eres el director creativo de ANARIAS Atelier, una marca de moda femenina premium colombiana.
Tu lenguaje es editorial, sofisticado, atemporal y cercano. Nunca genérico ni de fast-fashion.

REGLAS ABSOLUTAS — no hay excepciones:
1. NUNCA inventes materiales que no estén mencionados en los datos del producto.
2. NUNCA inventes beneficios técnicos no verificables (transpirable, antibacterial, etc.).
3. NUNCA cambies el nombre del producto sin explicar el motivo en risk_notes.
4. EVITA estas frases exactas: "la mejor calidad", "compra ahora", "envío gratis",
   "increíble", "único", "exclusivo", "lujo", "de lujo", "precio bajo", "oferta".
5. USA vocabulario de moda: silueta, caída, estructura, detalle, pieza, colección,
   look, atemporal, versátil, temporada, volumen, corte, acabado, proporción, línea.
6. La descripción debe sonar a editorial de revista, no a ficha técnica de tienda.
7. seo_title: MÁXIMO 60 caracteres (cuenta exactamente, sin excepción).
8. seo_description: MÁXIMO 160 caracteres (cuenta exactamente, sin excepción).
9. alt_texts: uno por imagen, descriptivo, natural, útil para SEO.
   Ejemplo: "Camisa oxford blanca ANARIAS Atelier — vista frontal sobre fondo neutro".
10. El HTML de description solo puede usar: <p>, <br>, <strong>, <em>, <ul>, <li>.
11. Responde ÚNICAMENTE con el JSON válido. Sin texto adicional. Sin markdown.`;

function buildProductPrompt(product: ShopifyProduct): string {
  const productData = {
    title: product.title,
    handle: product.handle,
    productType: product.productType || 'No especificado',
    vendor: product.vendor || 'ANARIAS Atelier',
    status: product.status,
    tags: product.tags,
    currentDescription: product.descriptionHtml || '(vacía)',
    currentSeoTitle: product.seo.title || '(vacío)',
    currentSeoDescription: product.seo.description || '(vacío)',
    collections: product.collections.map(c => c.title),
    options: product.options.map(o => ({ name: o.name, values: o.values })),
    variants: product.variants.map(v => ({
      title: v.title,
      sku: v.sku || '',
      price: v.price,
      inventoryQty: v.inventoryQuantity,
      options: v.selectedOptions,
    })),
    imageCount: product.media.length,
    currentAltTexts: product.media.map((m, i) => ({
      index: i + 1,
      currentAlt: m.alt || '(vacío)',
      url: m.image.url,
      dimensions: `${m.image.width}x${m.image.height}px`,
    })),
  };

  return `Analiza este producto de ANARIAS Atelier y genera las optimizaciones de copy y SEO.

DATOS DEL PRODUCTO:
${JSON.stringify(productData, null, 2)}

Responde con este JSON exacto (sin markdown, sin texto antes o después):
{
  "title_suggested": "string — título refinado, máx 70 chars",
  "description_html_suggested": "string — HTML editorial, 100-300 palabras",
  "seo_title": "string — MÁXIMO 60 caracteres, incluye marca",
  "seo_description": "string — MÁXIMO 160 caracteres, evocador y factual",
  "tags_suggested": ["array de tags SEO relevantes en español"],
  "alt_texts": ["un string por cada imagen en el orden dado arriba"],
  "color_name_suggestions": ["nombres de color refinados si hay opción de color, sino array vacío"],
  "collection_notes": "string — sugerencias de colecciones donde ubicar el producto",
  "risk_notes": "string — advertencias sobre cambios propuestos, especialmente si se sugiere renombrar"
}`;
}

export async function optimizeProductWithClaude(
  product: ShopifyProduct
): Promise<ClaudeOptimization> {
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      logger.debug(`Claude: analizando "${product.title}" (intento ${attempt})`, product.handle);

      const response = await client.messages.create({
        model: config.anthropic.model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildProductPrompt(product) }],
      });

      const content = response.content[0];
      if (!content || content.type !== 'text') {
        throw new Error('Respuesta inesperada de Claude (no texto)');
      }

      const parsed = parseClaudeJSON(content.text);

      // Enforce hard limits post-parse
      if (parsed.seo_title.length > 60) {
        parsed.seo_title = parsed.seo_title.slice(0, 57) + '...';
      }
      if (parsed.seo_description.length > 160) {
        parsed.seo_description = parsed.seo_description.slice(0, 157) + '...';
      }

      return parsed;
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) throw err;
      logger.warn(`Claude intento ${attempt} falló: ${(err as Error).message}`, product.handle);
      await sleep(2000 * attempt);
    }
  }

  throw new Error('Claude: máximo de intentos alcanzado');
}
