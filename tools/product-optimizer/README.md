# ANARIAS Atelier — Product Optimizer

Herramienta interna para auditar, optimizar y actualizar productos de Shopify usando la Admin API GraphQL y Claude como capa de análisis SEO/copy.

---

## Requisitos

- Node.js 18 o superior
- Cuenta Shopify con Admin API habilitada (scope: `read_products`, `write_products`, `write_files`)
- API Key de Anthropic

---

## Instalación

```bash
cd tools/product-optimizer
npm install
cp .env.example .env
# Edita .env con tus credenciales
```

---

## Configuración (.env)

| Variable | Requerida | Descripción |
|---|---|---|
| `SHOPIFY_STORE_DOMAIN` | ✓ | `tu-tienda.myshopify.com` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | ✓ | Token de Admin API (`shpat_...`) |
| `SHOPIFY_API_VERSION` | — | Default: `2025-01` |
| `ANTHROPIC_API_KEY` | ✓ | `sk-ant-api03-...` |
| `CLAUDE_MODEL` | — | Default: `claude-opus-4-8` |
| `TARGET_HANDLES` | — | Handles separados por coma para procesar subconjunto |
| `TARGET_PRODUCT_IDS` | — | IDs GraphQL separados por coma |

---

## Comandos

### `npm run audit`

Conecta a Shopify, trae todos los productos activos y borradores, y ejecuta una auditoría SEO/content completa.

```bash
npm run audit
# Solo handles específicos:
npm run audit -- camisa-oxford pantalon-negro
```

**Detecta:**
- Meta title vacío o > 60 caracteres
- Meta description vacía o > 160 caracteres
- Descripción ausente o muy corta (< 100 caracteres)
- Imágenes sin ALT text
- Nombres de color inconsistentes (español/inglés mezclado, mayúsculas mixtas)
- Productos activos sin stock
- Imágenes con dimensiones exageradas (> 4000px)
- Posibles productos duplicados (similitud de título > 72%)

**Output:** `output/audit-YYYY-MM-DDTHH-MM-SS.json`

---

### `npm run preview`

Ejecuta la auditoría (o reutiliza la del día) y luego:
1. Envía cada producto a Claude para optimización de copy + SEO
2. Descarga y comprime imágenes con Sharp (WebP, máx 2048px, ~85% calidad)
3. Genera un backup completo de cada producto
4. Crea CSV y JSON con todos los cambios propuestos para revisión

```bash
npm run preview
# Solo handles específicos:
npm run preview -- camisa-oxford pantalon-negro
```

**Output:**
- `output/previews/preview-TIMESTAMP.csv` — para revisión en Excel/Sheets
- `output/previews/preview-TIMESTAMP.json` — para apply
- `output/backups/TIMESTAMP-{handle}.json` — backup por producto
- `output/images/original/` — imágenes originales descargadas
- `output/images/optimized/` — imágenes en WebP comprimidas

**Revisa el CSV antes de continuar.**

---

### `npm run apply`

Lee el último preview generado y aplica los cambios aprobados a Shopify.

```bash
# Aplicar todo (tras revisar el CSV)
npm run apply

# Simular sin cambios reales
npm run apply -- --dry-run

# Solo handles específicos
npm run apply -- --handles=camisa-oxford,pantalon-negro

# Solo campos específicos
npm run apply -- --fields=seo,alt_texts

# Combinado
npm run apply -- --handles=camisa-oxford --fields=seo,description --dry-run
```

**Campos disponibles:** `title`, `description`, `seo`, `tags`, `alt_texts`, `images`

El campo `images` sube las versiones WebP optimizadas a Shopify mediante staged uploads.

---

### `npm run rollback`

Revierte productos a sus valores originales usando los backups JSON.

```bash
# Revertir todos los productos del último backup
npm run rollback

# Solo handles específicos
npm run rollback -- --handles=camisa-oxford

# Simular rollback
npm run rollback -- --dry-run

# Usar backups de un timestamp específico
npm run rollback -- --timestamp=2024-01-15T10
```

---

## Flujo recomendado

```
1.  npm run audit
    └─ Revisa la consola y el JSON de auditoría

2.  npm run preview
    └─ Espera (Claude + imágenes puede tomar varios minutos)
    └─ Abre output/previews/preview-TIMESTAMP.csv en Sheets
    └─ Revisa cada sugerencia, especialmente las de risk_level: high

3.  npm run apply -- --dry-run
    └─ Confirma qué cambiaría

4.  npm run apply
    └─ Aplica los cambios

5.  (Si algo salió mal)
    npm run rollback -- --handles=camisa-oxford
```

---

## Arquitectura

```
src/
├── types/index.ts          — Interfaces TypeScript
├── config/env.ts           — Variables de entorno validadas
├── api/
│   ├── shopify-client.ts   — Cliente GraphQL con retry y rate limiting
│   ├── shopify-queries.ts  — Queries de lectura de productos
│   ├── shopify-mutations.ts — Mutations de actualización
│   └── claude-client.ts    — Integración con Anthropic Claude
├── modules/
│   ├── audit.ts            — Lógica de auditoría SEO/content
│   ├── images.ts           — Descarga, compresión y upload de imágenes
│   ├── preview.ts          — Generación de CSV/JSON de preview
│   ├── apply.ts            — Aplicación de cambios a Shopify
│   └── rollback.ts         — Reversión desde backups
├── utils/
│   ├── logger.ts           — Logger con colores y archivos de log
│   ├── csv-writer.ts       — Generador de CSV compatible con Excel
│   ├── validators.ts       — Validación de respuestas Claude
│   └── helpers.ts          — Utilidades (slugify, formatBytes, etc.)
└── scripts/
    ├── audit.ts            — Entry point npm run audit
    ├── preview.ts          — Entry point npm run preview
    ├── apply.ts            — Entry point npm run apply
    └── rollback.ts         — Entry point npm run rollback

output/
├── audit-TIMESTAMP.json    — Resultados de auditoría
├── backups/                — Backup JSON por producto (antes de apply)
├── previews/               — CSV y JSON de preview para revisión
├── images/
│   ├── original/           — Imágenes originales descargadas de Shopify CDN
│   └── optimized/          — Imágenes WebP comprimidas (listas para subir)
└── logs/                   — Logs de sesión por fecha
```

---

## Reglas de copy de Claude

El sistema prompt garantiza que Claude:

- No invente materiales no mencionados en el producto
- No invente beneficios técnicos
- No cambie el nombre sin justificación en `risk_notes`
- Evite frases genéricas de ecommerce
- Use vocabulario editorial de moda
- Respete límites de caracteres (60 para SEO title, 160 para meta description)
- Genere ALT texts descriptivos y útiles para SEO

---

## Optimización de imágenes

| Parámetro | Valor |
|---|---|
| Formato output | WebP |
| Calidad | 85% (ajusta si supera 450 KB) |
| Lado máximo | 2048 px (sin deformar) |
| Objetivo de peso | < 450 KB |
| Nomenclatura | `anarias-{producto}-{color}-{tipo}.webp` |

Las imágenes originales se guardan en `output/images/original/` y nunca se eliminan. Los archivos WebP se guardan en `output/images/optimized/` y solo se suben a Shopify cuando ejecutas `npm run apply --fields=images`.

---

## Seguridad

- Credenciales solo en `.env` (nunca en el código)
- `.env` está en `.gitignore`
- Backup completo de cada producto antes de cualquier cambio
- Modo `--dry-run` disponible en `apply` y `rollback`
- Si un producto falla, la herramienta continúa con el siguiente
- Logs detallados en `output/logs/`
- Rate limiting automático para no exceder límites de la Shopify API

---

## Ejemplo de salida CSV

Ver `output/previews/preview-example.csv` para el formato de columnas.

| Columna | Descripción |
|---|---|
| `product_id` | ID GraphQL del producto |
| `handle` | Handle de Shopify |
| `risk_level` | `low` / `medium` / `high` |
| `audit_score` | Score 0–100 (100 = sin problemas) |
| `title_suggested` | Título propuesto por Claude |
| `seo_title_suggested` | Meta title (máx 60 chars) |
| `seo_description_suggested` | Meta description (máx 160 chars) |
| `image_savings_percentage` | Ahorro de peso en imágenes |

---

## Permisos de Shopify Admin API requeridos

Al crear el Custom App en Shopify Admin:

- `read_products` — leer productos
- `write_products` — actualizar título, descripción, SEO, tags, ALT
- `write_files` — subir imágenes optimizadas

---

## Soporte

Herramienta interna de ANARIAS Atelier. Desarrollada para uso con Shopify Admin API 2025-01 y Claude Opus 4.
