import https from 'node:https';
import { publicCameras } from './camera-catalog.mjs';

const normalize = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
export function parseTollStreams(html) {
  const result = new Map();
  for (const card of html.split(/class=["'][^"']*\bcard-cctv\b[^"']*["']/i).slice(1)) {
    const name = card.match(/<h5\b[^>]*>([\s\S]*?)<\/h5>/i)?.[1];
    const stream = card.match(/<source\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
    if (!name || !stream) continue;
    const key = normalize(name);
    result.set(key, result.has(key) ? null : stream.replace(/&amp;/g, '&'));
  }
  return result;
}
export function validTollReplacement(source, value) {
  try {
    const old = new URL(source.streamUrl),
      next = new URL(value);
    return (
      ['http:', 'https:'].includes(old.protocol) &&
      (old.origin === 'https://jmlive.jasamarga.com' || isTollPage(source.url)) &&
      next.origin === old.origin &&
      !next.username &&
      !next.password &&
      !next.hash &&
      /\.m3u8$/i.test(next.pathname) &&
      (old.origin !== 'https://jmlive.jasamarga.com' || (
        !next.search &&
        /^\/hls\/\d+\/[a-f0-9-]{36}\/index\.m3u8$/.test(next.pathname) &&
        next.pathname.split('/')[2] === old.pathname.split('/')[2]
      ))
    );
  } catch {
    return false;
  }
}
function isTollPage(value) {
  try {
    const page = new URL(value);
    return page.origin === 'https://binamarga.pu.go.id' &&
      /^\/contents\/cctv_tol\/?$/.test(page.pathname) &&
      !page.username && !page.password && !page.hash &&
      /^[a-z0-9-]+$/.test(page.searchParams.get('id_ruas') || '') && page.searchParams.size === 1;
  } catch { return false; }
}
export function fetchTollPage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { family: 4, headers: { 'User-Agent': 'JEJAK/1.0 public CCTV resolver' } },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('Toll directory unavailable'));
          return;
        }
        let text = '',
          size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) req.destroy(new Error('Toll directory too large'));
          else text += chunk;
        });
        res.on('end', () => resolve(text));
        res.on('error', reject);
      },
    );
    const timer = setTimeout(() => req.destroy(new Error('Toll directory timeout')), 10000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
  });
}
export function createTollResolver({
  catalogue = publicCameras,
  fetchPage = fetchTollPage,
  now = Date.now,
} = {}) {
  const sources = new Map(
    catalogue
      .filter((c) => c.streamUrl && isTollPage(c.url))
      .map((c) => [c.id, c]),
  );
  const pages = new Map();
  let active = 0;
  return async (id, current) => {
    const source = sources.get(id);
    if (!source) return null;
    const page = new URL(source.url);
    let cached = pages.get(page.href);
    if (!cached || now() > cached.until) {
      if (active >= 2) return null;
      active++;
      const promise = fetchPage(page.href)
        .then(parseTollStreams)
        .catch(() => new Map())
        .finally(() => active--);
      cached = { until: now() + 60000, promise };
      pages.set(page.href, cached);
    }
    const stream = (await cached.promise).get(normalize(source.name));
    if (!stream) return null;
    let next;
    try {
      next = new URL(stream);
    } catch {
      return null;
    }
    if (!validTollReplacement(source, next) || next.href === String(current))
      return null;
    return next;
  };
}
export const resolveTollStream = createTollResolver();
