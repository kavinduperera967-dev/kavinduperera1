// Portfolio server - zero dependencies. Needs Node.js 18+.  Run: node server.js
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'storage');
const UP = path.join(DATA, 'uploads'), DB = path.join(DATA, 'data.json');
const PUB = path.join(__dirname, 'public');
const MAX_UP = Number(process.env.MAX_UPLOAD_MB || 300) * 1048576;
fs.mkdirSync(UP, { recursive: true });

// PIN: ADMIN_PIN env var wins, otherwise config.json (made by:  node set-pin.js YOUR_PIN)
let HASH = null;
if (process.env.ADMIN_PIN) { const salt = crypto.randomBytes(16).toString('hex'); HASH = { salt, hash: crypto.scryptSync(String(process.env.ADMIN_PIN), salt, 32).toString('hex') }; }
else { try { HASH = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch {} }
if (!HASH) { console.error('No PIN set. Run:  node set-pin.js YOUR_PIN   (or set ADMIN_PIN)'); process.exit(1); }
const checkPin = pin => crypto.timingSafeEqual(crypto.scryptSync(pin, HASH.salt, 32), Buffer.from(HASH.hash, 'hex'));

let SECRET;
const sf = path.join(DATA, 'secret.txt');
try { SECRET = fs.readFileSync(sf, 'utf8'); }
catch { SECRET = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(sf, SECRET); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.ico': 'image/x-icon' };
const UPTYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };

const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
function makeToken() { const exp = Date.now() + 7 * 864e5; return exp + '.' + sign(String(exp)); }
function isAdmin(req) {
  const m = /(?:^|;\s*)adm=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
const secure = req => req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
const ip = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',').pop().trim();

const fails = new Map();   // simple brute-force protection
function locked(i) { const f = fails.get(i); return f && f.n >= 5 && Date.now() - f.t < 60000; }
function failed(i) { const f = fails.get(i) || { n: 0, t: 0 }; f.n = (Date.now() - f.t > 60000 ? 0 : f.n) + 1; f.t = Date.now(); fails.set(i, f); }

function send(res, code, body, type = 'application/json', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req, limit) {
  return new Promise((ok, no) => {
    const a = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { no(Object.assign(new Error('Too large'), { code: 413 })); req.destroy(); } else a.push(c); });
    req.on('end', () => ok(Buffer.concat(a)));
    req.on('error', no);
  });
}
function sendFile(req, res, file, cache) {
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) return send(res, 404, 'Not found', 'text/plain');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const h = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' };
    const r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (r) {                                   // range support so videos can seek
      let s = r[1] === '' ? st.size - Number(r[2]) : Number(r[1]);
      let en = r[1] === '' || r[2] === '' ? st.size - 1 : Math.min(Number(r[2]), st.size - 1);
      if (s < 0 || s > en || s >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      res.writeHead(206, { ...h, 'Content-Range': `bytes ${s}-${en}/${st.size}`, 'Content-Length': en - s + 1 });
      return fs.createReadStream(file, { start: s, end: en }).pipe(res);
    }
    res.writeHead(200, { ...h, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}
function cleanup(text) {                       // delete uploads no longer used (older than 1 hour)
  const used = new Set([...text.matchAll(/\/uploads\/([a-f0-9]{24}\.[a-z0-9]+)/g)].map(m => m[1]));
  for (const f of fs.readdirSync(UP)) {
    const p = path.join(UP, f);
    if (!used.has(f) && Date.now() - fs.statSync(p).mtimeMs > 3600e3) fs.unlink(p, () => {});
  }
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), p = url.pathname;

    if (p === '/api/data' && req.method === 'GET') {
      let t = '{}'; try { t = fs.readFileSync(DB, 'utf8'); } catch {}
      return send(res, 200, t, 'application/json', { 'Cache-Control': 'no-store' });
    }
    if (p === '/api/me') return send(res, 200, { admin: isAdmin(req) }, 'application/json', { 'Cache-Control': 'no-store' });

    if (p === '/api/login' && req.method === 'POST') {
      const i = ip(req);
      if (locked(i)) return send(res, 429, 'Too many tries. Wait a minute.', 'text/plain');
      let pin = ''; try { pin = String(JSON.parse((await readBody(req, 2048)).toString()).pin || ''); } catch {}
      if (!checkPin(pin)) { failed(i); return send(res, 401, 'Wrong PIN', 'text/plain'); }
      fails.delete(i);
      return send(res, 200, { ok: true }, 'application/json',
        { 'Set-Cookie': `adm=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${7 * 86400}${secure(req) ? '; Secure' : ''}` });
    }
    if (p === '/api/logout' && req.method === 'POST')
      return send(res, 200, { ok: true }, 'application/json', { 'Set-Cookie': 'adm=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });

    if (p === '/api/data' && req.method === 'PUT') {
      if (!isAdmin(req)) return send(res, 401, 'Not allowed', 'text/plain');
      const text = (await readBody(req, 2 * 1048576)).toString();
      const o = JSON.parse(text); if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Bad data');
      fs.writeFileSync(DB + '.tmp', text); fs.renameSync(DB + '.tmp', DB);
      cleanup(text);
      return send(res, 200, { ok: true });
    }

    if (p === '/api/upload' && req.method === 'POST') {
      if (!isAdmin(req)) return send(res, 401, 'Not allowed', 'text/plain');
      const ext = UPTYPES[(req.headers['content-type'] || '').split(';')[0].trim()];
      if (!ext) return send(res, 415, 'Only JPG, PNG, WebP, GIF, MP4, WebM, MOV files', 'text/plain');
      const name = crypto.randomBytes(12).toString('hex') + ext, file = path.join(UP, name);
      let n = 0, dead = false;
      const out = fs.createWriteStream(file);
      req.on('data', c => { n += c.length; if (n > MAX_UP && !dead) { dead = true; req.unpipe(out); out.destroy(); fs.unlink(file, () => {}); send(res, 413, 'File too large (max ' + MAX_UP / 1048576 + ' MB)', 'text/plain'); } });
      req.pipe(out);
      out.on('finish', () => { if (!dead) send(res, 200, { url: '/uploads/' + name }); });
      out.on('error', () => { if (!dead) send(res, 500, 'Write failed', 'text/plain'); });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
    if (p.startsWith('/uploads/')) {
      const f = path.basename(p);
      if (!/^[a-f0-9]{24}\.[a-z0-9]+$/.test(f)) return send(res, 404, 'Not found', 'text/plain');
      return sendFile(req, res, path.join(UP, f), 'public, max-age=31536000, immutable');
    }
    const rel = p === '/' ? 'index.html' : decodeURIComponent(p).replace(/^\/+/, '');
    const file = path.join(PUB, rel);
    if (!file.startsWith(PUB + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
    return sendFile(req, res, file, 'no-cache');
  } catch (e) {
    if (!res.headersSent) send(res, e.code === 413 ? 413 : 400, e.message || 'Error', 'text/plain');
  }
}).listen(PORT, () => console.log('Portfolio running on http://localhost:' + PORT ));
