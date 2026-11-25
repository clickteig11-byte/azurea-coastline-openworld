import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHAR_DIR = path.join(ROOT, 'public', 'models', 'characters');
const UI_PATH = path.join(ROOT, 'tripo-studio', 'index.html');
const PORT = Number(process.env.TRIPO_STUDIO_PORT || 4321);
const TRIPO_BASE = 'https://api.tripo3d.ai/v2/openapi';

function readEnvKey() {
  if (process.env.TRIPO_API_KEY) return process.env.TRIPO_API_KEY.trim();
  for (const fname of ['.env.local', '.env']) {
    const p = path.join(ROOT, fname);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*TRIPO_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^['"]|['"]$/g, '');
    }
  }
  return '';
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Tripo-Key',
  });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function tripoFetch(apiKey, endpoint, opts = {}) {
  const r = await fetch(`${TRIPO_BASE}${endpoint}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(opts.headers || {}),
    },
  });
  return await r.json();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Tripo-Key',
    });
    return res.end();
  }

  const apiKey = req.headers['x-tripo-key']?.toString().trim() || readEnvKey();

  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(UI_PATH, 'utf8'));
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, { ok: true, hasDefaultKey: Boolean(readEnvKey()) });
    }

    if (req.method === 'GET' && url.pathname === '/api/models') {
      fs.mkdirSync(CHAR_DIR, { recursive: true });
      const files = fs
        .readdirSync(CHAR_DIR)
        .filter((f) => f.endsWith('.glb'))
        .map((f) => {
          const st = fs.statSync(path.join(CHAR_DIR, f));
          return { name: f, url: `/models/characters/${f}`, bytes: st.size, mtime: st.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
      return json(res, 200, { files });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/models/characters/')) {
      const safeName = path.basename(url.pathname);
      const filePath = path.join(CHAR_DIR, safeName);
      if (!fs.existsSync(filePath)) return json(res, 404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(filePath).pipe(res);
    }

    if (!apiKey) {
      return json(res, 401, { error: 'Missing TRIPO_API_KEY in .env.local or X-Tripo-Key header' });
    }

    if (req.method === 'GET' && url.pathname === '/api/balance') {
      const data = await tripoFetch(apiKey, '/user/balance');
      return json(res, 200, data);
    }

    if (req.method === 'POST' && url.pathname === '/api/upload') {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const base64 = (body.dataUrl || '').replace(/^data:[^;]+;base64,/, '');
      const buf = Buffer.from(base64, 'base64');
      const mime = body.mime || 'image/jpeg';
      const ext = mime.includes('png') ? 'png' : 'jpg';
      const form = new FormData();
      form.append('file', new Blob([buf], { type: mime }), `upload.${ext}`);
      const data = await tripoFetch(apiKey, '/upload', { method: 'POST', body: form });
      return json(res, 200, { ...data, ext });
    }

    if (req.method === 'POST' && url.pathname === '/api/task') {
      const payload = JSON.parse((await readBody(req)).toString('utf8'));
      const data = await tripoFetch(apiKey, '/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return json(res, 200, data);
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/task/')) {
      const id = path.basename(url.pathname);
      const data = await tripoFetch(apiKey, `/task/${id}`);
      return json(res, 200, data);
    }

    if (req.method === 'POST' && url.pathname === '/api/save-glb') {
      const { url: glbUrl, filename } = JSON.parse((await readBody(req)).toString('utf8'));
      const slug = (filename || `tripo-${Date.now()}`)
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const outName = slug.endsWith('.glb') ? slug : `${slug}.glb`;
      const outPath = path.join(CHAR_DIR, outName);
      const glbRes = await fetch(glbUrl);
      if (!glbRes.ok) return json(res, 502, { error: `Failed to download GLB: ${glbRes.status}` });
      const buf = Buffer.from(await glbRes.arrayBuffer());
      fs.mkdirSync(CHAR_DIR, { recursive: true });
      fs.writeFileSync(outPath, buf);
      return json(res, 200, { ok: true, filename: outName, url: `/models/characters/${outName}`, bytes: buf.length });
    }

    json(res, 404, { error: 'Unknown route' });
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Tripo 3D Studio running at http://127.0.0.1:${PORT}\n`);
});
