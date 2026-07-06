// /api/vault.js — proxy to sws-svc-vault-production.up.railway.app/v1
// Forwards any /api/vault/* request to the Vault microservice so the frontend
// can call it without CORS issues.

const DEFAULT_TARGET = 'https://sws-svc-vault-production.up.railway.app/v1';
const TARGET = (process.env.VAULT_API_URL || DEFAULT_TARGET).replace(/\/$/, '');

export const config = {
  api: {
    bodyParser: false,
  },
};

function collectBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-ID, X-Mock-Auth-Key');
    return res.status(204).end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\/api\/vault/, '') || '/';
  const targetUrl = `${TARGET}${path}${url.search}`;

  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (['host', 'connection', 'content-length', 'content-encoding', 'transfer-encoding'].includes(lower)) {
      continue;
    }
    headers[key] = Array.isArray(value) ? value.join(', ') : value;
  }

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await collectBody(req);
    if (body.length > 0) {
      headers['content-length'] = String(body.length);
    }
  }

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body && body.length > 0 ? body : undefined,
    });

    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) return;
      res.setHeader(key, value);
    });

    const data = await response.arrayBuffer();
    res.send(Buffer.from(data));
  } catch (err) {
    console.error('[vault-proxy]', err);
    res.status(502).json({ error: 'Vault service unreachable', details: err.message });
  }
}
