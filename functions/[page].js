const PAGE_ASSETS = {
  admin: {
    desktop: '/Nudema Admin.dc',
    mobile: '/Nudema Admin Mobile.dc',
  },
  login: '/Nudema Login.dc',
  signup: '/Nudema Signup.dc',
  account: '/Nudema Account.dc',
  search: '/Nudema Search.dc',
  product: '/Nudema Product.dc',
  cart: '/Nudema Cart.dc',
  checkout: '/Nudema Checkout.dc',
  privacy: '/Nudema Privacy.dc',
  terms: '/Nudema Terms.dc',
};

const LEGACY_PATHS = {
  'Nudema Mongolia.dc': '/',
  'Nudema Mongolia.dc.html': '/',
  'Nudema Mobile.dc': '/?v=mobile',
  'Nudema Mobile.dc.html': '/?v=mobile',
  'Nudema Admin.dc': '/admin',
  'Nudema Admin.dc.html': '/admin',
  'Nudema Admin Mobile.dc': '/admin?v=mobile',
  'Nudema Admin Mobile.dc.html': '/admin?v=mobile',
  'Nudema Login.dc': '/login',
  'Nudema Login.dc.html': '/login',
  'Nudema Signup.dc': '/signup',
  'Nudema Signup.dc.html': '/signup',
  'Nudema Account.dc': '/account',
  'Nudema Account.dc.html': '/account',
  'Nudema Search.dc': '/search',
  'Nudema Search.dc.html': '/search',
  'Nudema Product.dc': '/product',
  'Nudema Product.dc.html': '/product',
  'Nudema Cart.dc': '/cart',
  'Nudema Cart.dc.html': '/cart',
  'Nudema Checkout.dc': '/checkout',
  'Nudema Checkout.dc.html': '/checkout',
  'Nudema Privacy.dc': '/privacy',
  'Nudema Privacy.dc.html': '/privacy',
  'Nudema Terms.dc': '/terms',
  'Nudema Terms.dc.html': '/terms',
};

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

function decodedPage(request) {
  const pathname = new URL(request.url).pathname.replace(/^\/+|\/+$/g, '');
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function legacyRedirect(request, destination) {
  const incoming = new URL(request.url);
  const target = new URL(destination, incoming.origin);
  for (const [key, value] of incoming.searchParams) {
    if (!target.searchParams.has(key)) target.searchParams.append(key, value);
  }
  target.hash = incoming.hash;
  return Response.redirect(target.toString(), 301);
}

async function servePage(context, page) {
  let assetPath = PAGE_ASSETS[page];
  if (page === 'admin') {
    assetPath = isMobileRequest(context.request) ? assetPath.mobile : assetPath.desktop;
  }

  const assetUrl = new URL(context.request.url);
  assetUrl.pathname = assetPath;
  assetUrl.search = '';
  assetUrl.hash = '';

  const assetResponse = await context.env.ASSETS.fetch(new Request(assetUrl, context.request));
  const headers = new Headers(assetResponse.headers);
  headers.set('Cache-Control', 'no-cache, must-revalidate');
  headers.set('Content-Location', `/${page}`);

  return new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
}

async function handleRequest(context) {
  const page = decodedPage(context.request);
  const destination = LEGACY_PATHS[page];
  if (destination) return legacyRedirect(context.request, destination);
  if (!PAGE_ASSETS[page]) return context.next();
  return servePage(context, page);
}

export function onRequestGet(context) {
  return handleRequest(context);
}

export function onRequestHead(context) {
  return handleRequest(context);
}
