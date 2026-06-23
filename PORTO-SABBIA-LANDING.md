# Porto Sabbia — Landing de lujo para captación de leads

Landing page única, premium y orientada a conversión que reúne **Porto Sabbia
Suites & Residences** (Bahía de Puerto Gaira, Playa Salguero, Santa Marta) en una
sola página construida sobre el theme Volt (Shopify OS 2.0).

> ⚠️ **Verifica los datos antes de publicar.** Áreas, precios y distancias se
> tomaron de fichas públicas de terceros (FincaRaíz, Constructora Jiménez) porque
> el sitio en vivo bloquea el rastreo automático (HTTP 403). Están como valores
> por defecto editables — confírmalos con la fuente oficial.

---

## 1. Auditoría — oportunidades de mejora detectadas

La auditoría se basa en la información pública del proyecto y en buenas prácticas
de landings inmobiliarias de alto ticket. El sitio actual reparte el mensaje en
varias páginas (`/`, `/suites`, `/residences`); la oportunidad central es
**consolidar todo en una sola landing de conversión.**

| # | Oportunidad | Por qué importa | Cómo lo resuelve esta landing |
|---|-------------|-----------------|-------------------------------|
| 1 | **Captura de datos débil / dispersa** | Si el visitante no deja sus datos, se pierde el lead | Formulario de contacto nativo de Shopify + WhatsApp + barra CTA fija + botón flotante, presentes durante todo el scroll |
| 2 | **Mensaje repartido en varias páginas** | El usuario de lujo decide rápido; cada clic extra pierde interés | Una sola landing con narrativa: deseo → proyectos → amenidades → inversión → ubicación → prueba visual → contacto |
| 3 | **Falta de jerarquía "lujo"** | El segundo hogar / inversión se vende con aspiración | Paleta navy + dorado champagne + marfil, tipografía serif display (Cormorant Garamond), microanimaciones sobrias |
| 4 | **Ángulo de inversión poco explícito** | El comprador caribe compra ROI + valorización, no solo m² | Sección de inversión con KPIs animados y argumentos de renta/valorización |
| 5 | **Sin datos estructurados (SEO)** | Google no entiende el proyecto ni muestra rich snippets | JSON-LD `ApartmentComplex`, `Organization`, `Offer` y `FAQPage` |
| 6 | **Sin escasez / urgencia** | La urgencia acelera la decisión | "Precios de lanzamiento", "cupos limitados", barra fija persistente |
| 7 | **Fricción móvil** | La mayoría del tráfico inmobiliario es móvil | Diseño mobile-first, formulario corto, WhatsApp a un toque |
| 8 | **Atribución inexistente** | Sin saber qué campaña trae leads, el pauta se desperdicia | Captura automática de UTMs + referrer en cada lead |
| 9 | **Confianza** | Ticket alto = se necesita respaldo | Sellos (constructora, frente al mar, beach club), nota de privacidad, FAQ |

---

## 2. Qué se construyó

Una **plantilla de página** (`templates/page.porto-sabbia.json`) compuesta por
secciones modulares y editables desde el editor de temas. Todo el CSS/JS vive en
assets propios (`porto-sabbia.css`, `porto-sabbia.js`) y está **scopeado bajo
`.porto`**, por lo que no afecta al resto de la tienda.

| Sección | Archivo | Rol en la conversión |
|---------|---------|----------------------|
| Hero cinemático | `sections/porto-hero.liquid` | Impacto + promesa + 1er CTA + datos estructurados |
| Proyectos | `sections/porto-projects.liquid` | Suites vs Residences con specs, precio y CTA por proyecto |
| Amenidades | `sections/porto-amenities.liquid` | Estilo de vida resort (deseo) |
| Inversión | `sections/porto-invest.liquid` | ROI/valorización con KPIs animados |
| Ubicación | `sections/porto-location.liquid` | Mapa + cercanías (la ubicación es el activo) |
| Galería | `sections/porto-gallery.liquid` | Prueba visual con lightbox |
| **Contacto / Lead** | `sections/porto-lead-form.liquid` | **Conversión principal**: formulario + WhatsApp + UTMs |
| FAQ | `sections/porto-faq.liquid` | Resuelve objeciones + `FAQPage` SEO |
| CTA flotante | `sections/porto-sticky-cta.liquid` | Barra fija + botón WhatsApp persistente |

Snippets de apoyo: `porto-assets.liquid` (carga CSS/JS/fuentes) y
`porto-icon.liquid` (set de iconos de línea).

---

## 3. Estrategia de marketing (captar datos)

1. **Una sola promesa por sección** y un CTA dominante: *"Quiero información"*.
2. **Oferta + escasez:** "precios de lanzamiento", "cupos primera etapa". Edítalo
   en la sección Contacto y en la barra fija.
3. **Lead magnet:** el formulario promete *brochure + plan de pagos* inmediato.
   Mantén el formulario corto (nombre, WhatsApp, email) → menos fricción, más leads.
4. **Doble vía de contacto:** formulario (queda registrado) **y** WhatsApp (cierre
   inmediato, ideal en LATAM). Configura el número real en 2 sitios:
   `Porto · Contacto / Lead` y `Porto · CTA flotante`.
5. **Pre-cualificación:** el formulario pregunta proyecto de interés y presupuesto
   → tu equipo prioriza leads calientes.
6. **Atribución automática:** cada lead guarda `utm_source/medium/campaign/term/
   content`, landing y referrer. Úsalo para saber qué campaña convierte.
7. **Remarketing:** instala Meta Pixel y Google Ads tag (Online Store → Preferences
   o vía `theme.liquid`). Crea audiencias de quienes vieron la landing y no enviaron
   el formulario.

---

## 4. Estrategia SEO

**On-page**
- Título y meta de la *página* en Shopify (Admin → Páginas → Edición de SEO).
  Sugerido: `Porto Sabbia | Apartamentos frente al mar en Santa Marta` y una meta
  de 150–160 caracteres con la propuesta de valor + ubicación.
- Encabezados jerárquicos: **un solo `<h1>`** (el hero), `<h2>` por sección.
- Keywords objetivo: *apartamentos frente al mar Santa Marta*, *inversión
  inmobiliaria Santa Marta*, *apartasuites Playa Salguero*, *Porto Sabbia*,
  *renta vacacional Santa Marta*.
- Alt text descriptivo en cada imagen de la galería (campo "Descripción").

**Datos estructurados (ya incluidos)**
- `ApartmentComplex` + `Organization` + `Offer` en el hero.
- `FAQPage` en la sección FAQ (apto para rich snippets).
- Valídalos en <https://search.google.com/test/rich-results> tras publicar.

**SEO local**
- Crea/optimiza la ficha de Google Business Profile del proyecto.
- Mantén NAP (nombre, dirección, teléfono) consistente con el JSON-LD.

**Rendimiento (Core Web Vitals)**
- Hero con `fetchpriority="high"`; resto de imágenes `loading="lazy"` (ya aplicado).
- Sube imágenes optimizadas (WebP, < 300 KB). El render es responsive (`srcset`).
- Animaciones respetan `prefers-reduced-motion` y la página degrada sin JS.

---

## 5. Cómo publicarla (Shopify Admin)

1. **Sube el theme** (o haz push de esta rama y publícala desde el panel).
2. Ve a **Contenido → Páginas → Agregar página**. Título: `Porto Sabbia`.
3. En **Plantilla de tema** elige **`page.porto-sabbia`**. Guarda.
4. Abre **Personalizar tema** sobre esa página para editar textos e **imágenes**
   (el hero y la galería vienen con placeholders).
5. Configura el **número de WhatsApp** real en las secciones *Contacto* y *CTA
   flotante*.
6. Revisa **precios, áreas y distancias** (valores por defecto a verificar).
7. Define el **email de notificación** (Admin → Configuración → Notificaciones)
   para recibir los leads del formulario. Idealmente conéctalo a tu CRM.
8. Edita el **SEO de la página** (título + meta description).
9. Añade la página al **menú** o úsala como destino de tus campañas.

---

## 6. Personalización rápida

- **Colores/typografía:** tokens `--porto-*` al inicio de `assets/porto-sabbia.css`.
- **Orden de secciones:** arrástralas en el editor; cada una carga sus propios estilos.
- **Quitar/duplicar proyectos o amenidades:** se manejan como bloques.
- **Mapa:** en *Porto · Ubicación* cambia el lugar y el zoom (sin API key).

---

## 7. Medición recomendada

- **GA4 + Meta Pixel** instalados a nivel de tienda.
- Evento de conversión = envío del formulario (página de éxito `?contact_posted=true`)
  y clics a WhatsApp.
- Revisa semanalmente qué `utm_campaign` genera más leads y optimiza el presupuesto.

---

### Notas técnicas
- Todo el código está namespeado bajo `.porto` y los assets sólo cargan en esta
  plantilla — **cero impacto** en el resto de la tienda.
- JS idempotente (seguro aunque se cargue varias veces), accesible (focus trap en
  lightbox, `aria-*` en FAQ) y con *fallback* sin JavaScript.
- CSS 29 KB · JS 13 KB (muy por debajo del límite de 150 KB de theme-check).
