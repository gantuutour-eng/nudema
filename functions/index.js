function requestedVariant(request) {
  const value = new URL(request.url).searchParams.get('v');
  return value === 'pc' || value === 'mobile' ? value : '';
}

function isMobileRequest(request) {
  const forced = requestedVariant(request);
  if (forced) return forced === 'mobile';

  if (request.headers.get('Sec-CH-UA-Mobile') === '?1') return true;
  const userAgent = request.headers.get('User-Agent') || '';
  return /Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini|Mobi/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && /Mobile/i.test(userAgent));
}

async function serveStorefront(context) {
  const assetUrl = new URL(context.request.url);
  assetUrl.pathname = isMobileRequest(context.request)
    ? '/Nudema Mobile.dc'
    : '/Nudema Mongolia.dc';
  assetUrl.search = '';
  assetUrl.hash = '';

  const assetRequest = new Request(assetUrl.toString(), context.request);
  const assetResponse = await context.env.ASSETS.fetch(assetRequest);
  const headers = new Headers(assetResponse.headers);
  headers.set('Cache-Control', 'no-cache, must-revalidate');
  headers.set('Content-Location', '/');

  return new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
}

export function onRequestGet(context) {
  return serveStorefront(context);
}

export function onRequestHead(context) {
  return serveStorefront(context);
}
