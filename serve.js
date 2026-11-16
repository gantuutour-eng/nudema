/* Nudema хуудсуудыг локалиар үзэх энгийн статик сервер.
 * Ажиллуулах: node serve.js   →  http://localhost:4321/
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 4321;

// Match the public page URLs served by Cloudflare Pages Functions.
// index.html is a deployment fallback that redirects to /?v=pc or /?v=mobile;
// serving it at / would redirect back to itself forever.
const PAGES = {
  '/admin': 'Nudema Admin.dc.html',
  '/login': 'Nudema Login.dc.html',
  '/signup': 'Nudema Signup.dc.html',
  '/account': 'Nudema Account.dc.html',
  '/search': 'Nudema Search.dc.html',
  '/product': 'Nudema Product.dc.html',
  '/cart': 'Nudema Cart.dc.html',
  '/checkout': 'Nudema Checkout.dc.html',
  '/privacy': 'Nudema Privacy.dc.html',
  '/terms': 'Nudema Terms.dc.html',
  '/oauth-home': 'oauth-home.html',
};

function isMobileRequest(req, url) {
  const variant = url.searchParams.get('v');
  if (variant === 'pc' || variant === 'mobile') return variant === 'mobile';
  if (req.headers['sec-ch-ua-mobile'] === '?1') return true;
  const ua = req.headers['user-agent'] || '';
  return /Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini|Mobi/i.test(ua) ||
    (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
}

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

async function handleRequest(req, res) {
  let rel;
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
    rel = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400); return res.end('Bad request');
  }

  if (rel === '/api/geocode' && (req.method === 'GET' || req.method === 'HEAD')) {
    const { onRequestGet } = await import('./functions/api/geocode.js');
    const response = await onRequestGet({ request: new Request(url.toString()) });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    return res.end(req.method === 'HEAD' ? undefined : await response.text());
  }

  // Serve the actual storefront without sending the browser through index.html.
  if (rel === '/' || rel === '/index.html') {
    rel = isMobileRequest(req, url) ? '/Nudema Mobile.dc.html' : '/Nudema Mongolia.dc.html';
  } else if (rel === '/admin' && isMobileRequest(req, url)) {
    rel = '/Nudema Admin Mobile.dc.html';
  } else if (Object.hasOwn(PAGES, rel)) {
    rel = '/' + PAGES[rel];
  } else if (rel.endsWith('.dc')) {
    // Existing template links also use the extensionless .dc asset names.
    rel += '.html';
  }

  // Замын халилтаас хамгаална
  const filePath = path.resolve(ROOT, '.' + rel);
  if (!filePath.startsWith(ROOT + path.sep)) {
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
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

if (require.main === module) {
  http.createServer(handleRequest).listen(PORT, () => console.log('Nudema local server → http://localhost:' + PORT + '/'));
}

module.exports = { handleRequest };
