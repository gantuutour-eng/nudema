// The client debounces typing; cache repeated queries. No personal details are logged.
const cache = new Map();
const MONGOLIA = [87.7, 41.5, 119.9, 52.2];
const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export function normalizePlaces(features) {
  return (Array.isArray(features) ? features : []).flatMap((f) => {
    const p = f.properties || {}, coordinates = f.geometry && f.geometry.coordinates;
    if (!coordinates || coordinates.length < 2) return [];
    const [lng, lat] = coordinates.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lng < MONGOLIA[0] || lng > MONGOLIA[2] || lat < MONGOLIA[1] || lat > MONGOLIA[3]) return [];
    if (p.countrycode && String(p.countrycode).toUpperCase() !== 'MN') return [];
    const parts = [p.name, [p.housenumber, p.street].filter(Boolean).join(' '), p.district, p.city, p.state].filter(Boolean);
    const label = [...new Set(parts)].join(', ').slice(0, 350);
    if (!label) return [];
    return [{ label, name: String(p.name || p.street || label).slice(0, 160), lat, lng }];
  }).slice(0, 6);
}

export async function onRequestGet({ request, env = {} }) {
  const q = String(new URL(request.url).searchParams.get('q') || '').trim();
  if (q.length < 3 || q.length > 160) return reply({ ok: false, error: 'Хайх хаягаа 3–160 тэмдэгтээр оруулна уу.' }, 400);
  const key = q.toLocaleLowerCase();
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return reply({ ok: true, places: saved.places });
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  try {
    const url = new URL('/api/', env.PHOTON_BASE_URL || 'https://photon.komoot.io');
    url.search = new URLSearchParams({ q, limit: '8', lat: '47.9189', lon: '106.917', bbox: MONGOLIA.join(',') }).toString();
    const response = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json', 'User-Agent': 'NudemaAddressSearch/1.0 (+https://nudema-mongolia.com)' } });
    if (!response.ok) throw new Error('Search unavailable');
    const places = normalizePlaces((await response.json()).features);
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, { places, expires: Date.now() + 300000 });
    return reply({ ok: true, places });
  } catch {
    return reply({ ok: false, error: 'Хаяг хайх боломжгүй байна. Дахин оролдох эсвэл газрын зураг дээр байршлаа сонгоно уу.' }, 503);
  } finally { clearTimeout(timer); }
}
