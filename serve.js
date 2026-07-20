/* Nudema хуудсуудыг локалиар үзэх энгийн статик сервер.
 * Ажиллуулах: node serve.js   →  http://localhost:4321/
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 4321;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

const server = http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400); return res.end('Bad request');
  }

  // index.html байвал түүнийг л үйлчилнэ (production-той ижил байхын тулд)
  if (rel === '/' || rel === '/index.html') {
    const indexPath = path.join(ROOT, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
      return res.end(fs.readFileSync(indexPath));
    }
    // Байхгүй бол хуудсуудын жагсаалтыг үүсгэнэ
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.dc.html')).sort();
    const links = pages.map(p =>
      `<li><a href="/${encodeURIComponent(p)}">${p.replace('.dc.html', '')}</a></li>`).join('');
    res.writeHead(200, { 'Content-Type': TYPES['.html'] });
    return res.end(`<!doctype html><meta charset="utf-8">
      <title>Nudema — локал</title>
      <style>body{font-family:system-ui,sans-serif;max-width:640px;margin:60px auto;padding:0 20px;color:#16255f}
      h1{font-size:20px}li{margin:10px 0;font-size:16px}a{color:#2a54e6}</style>
      <h1>Nudema — локал урьдчилан харах</h1><ul>${links}</ul>`);
  }

  // Замын халилтаас хамгаална
  const filePath = path.join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found: ' + rel);
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
});

server.listen(PORT, () => console.log('Nudema local server → http://localhost:' + PORT + '/'));
