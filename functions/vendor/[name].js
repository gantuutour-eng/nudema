const VENDOR_ASSETS = {
  react: [
    'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
    'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  ],
  'react-dom': [
    'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js',
    'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  ],
};

export async function onRequestGet(context) {
  const sources = VENDOR_ASSETS[context.params.name];
  if (!sources) return new Response('Not found.', { status: 404 });

  let lastError = '';
  for (const source of sources) {
    try {
      const upstream = await fetch(source, {
        headers: { Accept: 'application/javascript' },
        cf: { cacheEverything: true, cacheTtl: 31536000 },
      });
      if (!upstream.ok) {
        lastError = `HTTP ${upstream.status}`;
        continue;
      }
      return new Response(upstream.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (cause) {
      lastError = cause && cause.message ? cause.message : String(cause);
    }
  }

  return new Response(`Vendor asset unavailable: ${lastError}`, {
    status: 502,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
