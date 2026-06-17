import http from 'http';
import { exec } from 'child_process';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const SCOPES = 'read_products,write_products';
const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;

if (!CLIENT_ID || !CLIENT_SECRET || !SHOP) {
  console.error('\n❌ Faltan variables en .env. Asegúrate de tener:');
  console.error('   SHOPIFY_CLIENT_ID=...');
  console.error('   SHOPIFY_CLIENT_SECRET=...');
  console.error('   SHOPIFY_STORE_DOMAIN=anarias-atelier.myshopify.com\n');
  process.exit(1);
}

const state = Math.random().toString(36).substring(2, 15);
const authUrl =
  `https://${SHOP}/admin/oauth/authorize` +
  `?client_id=${CLIENT_ID}` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&state=${state}`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  if (url.pathname !== '/auth/callback') {
    res.end('Esperando autorización de Shopify...');
    return;
  }

  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  if (returnedState !== state) {
    res.end('Error: state no coincide.');
    server.close();
    return;
  }

  if (!code) {
    res.end('Error: Shopify no devolvió el código de autorización.');
    server.close();
    return;
  }

  try {
    const tokenRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
    });

    const data = (await tokenRes.json()) as { access_token?: string; errors?: string };

    if (!data.access_token) {
      res.end(`Error de Shopify: ${JSON.stringify(data)}`);
      server.close();
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;background:#111;color:#fff">
      <h2>✅ Token obtenido</h2>
      <p>Copia esta línea en tu archivo <code>.env</code>:</p>
      <code style="background:#222;padding:16px;display:block;word-break:break-all;font-size:14px">SHOPIFY_ADMIN_ACCESS_TOKEN=${data.access_token}</code>
      <p style="margin-top:24px">Ya puedes cerrar esta ventana y volver a la terminal.</p>
    </body></html>`);

    console.log('\n');
    console.log('══════════════════════════════════════════════════════');
    console.log('✅  TOKEN OBTENIDO — pégalo en tu .env');
    console.log('══════════════════════════════════════════════════════');
    console.log('');
    console.log(`SHOPIFY_ADMIN_ACCESS_TOKEN=${data.access_token}`);
    console.log('');
    console.log('══════════════════════════════════════════════════════');
    console.log('');
    console.log('Luego corre:  npm run audit');
    console.log('');

    server.close();
  } catch (err) {
    res.end(`Error interno: ${err}`);
    server.close();
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  ANARIAS — Generador de Token Shopify');
  console.log('══════════════════════════════════════════════');
  console.log('');
  console.log('Abriendo navegador para autorizar la app...');
  console.log('Si no abre solo, copia este enlace en Chrome:');
  console.log('');
  console.log(authUrl);
  console.log('');

  exec(`start "" "${authUrl}"`, () => {});
});
