import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { publicCameras } from './camera-catalog.mjs';
export const cameras = new Map(
  publicCameras.filter((c) => c.streamUrl).map((c) => [c.id, new URL(c.streamUrl)]),
);
const origins = new Set([
  'http://makassar.cctv.nusantarainfrastructure.com',
  'https://api-cctv.margaharjaya.co.id',
  'https://cctv.cctvdesari.online',
  'https://cctv.citramarga.com',
  'https://cctv.cms.co.id',
  'https://cctv.ctptollways.com:2254',
  'https://cctv.kkdm.co.id',
  'https://cctv.mms-corp.id',
  'https://cctv.waskitabumiwira.com',
  'https://cctv.wikaserangpanimbang.com',
  'https://cctvastra.lintasmarga.com',
  'https://cctvbakter.my.id:2017',
  'https://cctvjorrw1.com',
  'https://cijagolive.app-intracs.co.id:5443',
  'https://ithka.my.id:2017',
  'https://jmlive.jasamarga.com',
  'https://live.pbtr.co.id:5443',
  'https://paspro-streaming.co.id',
  'https://pptrlive.co.id',
  'https://pub2.hk-opt.com',
  'https://stream.bsdtol.com',
  'https://streaming-cct.co.id',
  'https://www.tjt-info.co.id',

  'https://camera.jtd.co.id',
  'https://extstream.hk-opt2.com',
  'https://info.serbaraja-tollroad.co.id:20443',
  'https://pub.hk-opt.com',

  'https://restreamer2.kotabogor.go.id',
  'https://dki-jkt.balitower.co.id:7028',
  'https://atcs-dishub.bandung.go.id:1990',
  'https://pelindung.bandung.go.id:3443',
  'https://atcs-dishubkbb.urbanaccess.net',
  'https://cctv.bandungkab.go.id',
  'https://cctv.garutkab.go.id',
  'https://atcs.banjarkota.go.id:5443',
  'https://atcs.cianjurkab.go.id:5443',
  'https://atcs.tasikmalayakota.go.id',
  'https://cctv-dishub.sukabumikab.go.id',
  'https://cctv.cirebonkota.go.id',
  'https://cctv.indramayukab.go.id',
  'https://cctv.tasikmalayakab.go.id',
  'https://dishub.depok.go.id',
  'https://ruas-ciranjang.jaring.host',
]);
const prefix = '/api/osint/camera-media/';
// Indramayu's public server first redirects to the same resource with a cookie check.
// Follow only this exact redirect, never an arbitrary upstream destination.
export async function fetchCameraMedia(url, options = {}, fetcher = fetch) {
  const first = await fetcher(url, { ...options, redirect: 'manual' });
  if (![301, 302, 303, 307, 308].includes(first.status)) return first;
  await first.body?.cancel();
  const target = new URL(first.headers.get('location') || '', url);
  const expected = new URL(url);
  expected.searchParams.set('cookieCheck', '1');
  if (new URL(url).origin !== 'https://cctv.indramayukab.go.id' || target.href !== expected.href)
    throw new Error('Unsupported media redirect');
  return fetcher(target, { ...options, redirect: 'error' });
}
export function mediaResourcePath(id, name) {
  return prefix + id + '/~' + Buffer.from(name).toString('base64url');
}
export function cameraMediaUrl(id, resource) {
  const base = cameras.get(id);
  if (
    !base ||
    !origins.has(base.origin) ||
    !resource ||
    resource.includes('..') ||
    /[\\\s#]/.test(resource) ||
    resource.startsWith('/') ||
    resource.includes('://') ||
    /%(?:2e|2f|5c)/i.test(resource)
  )
    return null;
  let url;
  try {
    url = new URL(resource, new URL('.', base));
  } catch {
    return null;
  }
  if (url.origin !== base.origin || !url.pathname.startsWith(new URL('.', base).pathname))
    return null;
  // Only the public provider query keys already present in the catalogue are accepted.
  for (const [key, value] of url.searchParams) {
    const providerSession =
      [
        'https://atcs-dishubkbb.urbanaccess.net',
        'https://cctv.indramayukab.go.id',
        'https://restreamer2.kotabogor.go.id',
      ].includes(base.origin) &&
      key === 'session' &&
      /^[A-Za-z0-9_-]{1,128}$/.test(value);
    const reloadParameter =
      base.origin === 'https://cctv.indramayukab.go.id' &&
      /\.m3u8?$/.test(url.pathname) &&
      ((['_HLS_msn', '_HLS_part'].includes(key) && /^\d{1,12}$/.test(value)) ||
        (key === '_HLS_skip' && ['YES', 'v2'].includes(value)));
    if (!providerSession && !reloadParameter && base.searchParams.get(key) !== value) return null;
  }
  return url;
}
export function rewriteCameraPlaylist(text, id, base) {
  if (!text.trimStart().startsWith('#EXTM3U')) throw new Error('Invalid HLS manifest');
  const rewrite = (value) => {
    const u = new URL(value, base);
    const root = new URL('.', cameras.get(id));
    if (u.origin !== root.origin || !u.pathname.startsWith(root.pathname))
      throw new Error('Unsupported media reference');
    const name = u.pathname.slice(root.pathname.length) + u.search;
    const allowed = cameraMediaUrl(id, name);
    if (!allowed || allowed.href !== u.href) throw new Error('Unsupported media reference');
    return mediaResourcePath(id, name);
  };
  return text
    .trimStart()
    .split(/\r?\n/)
    .map((raw) => {
      const line = raw.trim();
      return line.startsWith('#')
        ? line.replace(/URI="([^"]+)"/g, (_, url) => `URI="${rewrite(url)}"`)
        : line.trim()
          ? rewrite(line.trim())
          : line;
    })
    .join('\n');
}
let active = 0;
export async function serveOsintCameraMedia(req, res, fetchUpstream = fetch) {
  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end();
    return;
  }
  const parts = new URL(req.url, 'http://local').pathname.slice(prefix.length).split('/');
  let resource = parts[1] || '';
  if (resource.startsWith('~')) {
    const token = resource.slice(1);
    resource = Buffer.from(token, 'base64url').toString('utf8');
    if (Buffer.from(resource).toString('base64url') !== token) resource = '';
  }
  let url = parts.length === 2 ? cameraMediaUrl(parts[0], resource) : null;
  const reload = new URL(req.url, 'http://local').searchParams;
  if (url && url.origin === 'https://cctv.indramayukab.go.id' && reload.size) {
    const requested = new URL(url);
    for (const [key, value] of reload) requested.searchParams.set(key, value);
    const root = new URL('.', cameras.get(parts[0]));
    url = cameraMediaUrl(
      parts[0],
      requested.pathname.slice(root.pathname.length) + requested.search,
    );
  }
  if (!url) {
    res.writeHead(404);
    res.end();
    return;
  }
  if (active >= 20) {
    res.writeHead(503, { 'Retry-After': '2' });
    res.end();
    return;
  }
  const abort = new AbortController(),
    timer = setTimeout(() => abort.abort(), 15000);
  const closed = () => abort.abort();
  res.on('close', closed);
  active++;
  try {
    const playlist = /\.m3u8?$/.test(url.pathname);
    const range = !playlist ? req.headers?.range : undefined;
    if (range && !/^bytes=\d+-\d*$/.test(range)) {
      res.writeHead(416);
      res.end();
      return;
    }
    const response = await fetchCameraMedia(
      url,
      {
        signal: abort.signal,
        redirect: 'error',
        headers: range ? { Range: range } : undefined,
      },
      fetchUpstream,
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Upstream unavailable');
    }
    if (
      !playlist &&
      /(?:text\/html|application\/json)/i.test(response.headers.get('content-type') || '')
    ) {
      await response.body?.cancel();
      throw new Error('Upstream returned an error page instead of media');
    }
    const headers = {
      'Content-Type': playlist ? 'application/vnd.apple.mpegurl' : 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (playlist) {
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 1024 * 1024) throw new Error('Manifest too large');
        chunks.push(chunk);
      }
      const data = Buffer.from(
        rewriteCameraPlaylist(Buffer.concat(chunks).toString('utf8'), parts[0], url),
      );
      if (!res.destroyed) {
        res.writeHead(200, headers);
        res.end(data);
      }
    } else {
      // Pass chunks immediately, respecting downstream backpressure; never buffer a whole segment.
      let size = 0;
      const limit = new Transform({
        transform(chunk, _encoding, done) {
          size += chunk.length;
          done(size > 16 * 1024 * 1024 ? new Error('Media too large') : null, chunk);
        },
      });
      if (response.status === 206) {
        const contentRange = response.headers.get('content-range');
        if (!contentRange) throw new Error('Missing content range');
        headers['Content-Range'] = contentRange;
      }
      const acceptRanges = response.headers.get('accept-ranges');
      if (acceptRanges) headers['Accept-Ranges'] = acceptRanges;
      res.writeHead(response.status === 206 ? 206 : 200, headers);
      await pipeline(Readable.fromWeb(response.body), limit, res, { signal: abort.signal });
    }
  } catch {
    if (!res.destroyed && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Stream penyedia tidak tersedia.' }));
    }
  } finally {
    abort.abort();
    active--;
    clearTimeout(timer);
    res.off('close', closed);
  }
}
