import { cameras, cameraMediaUrl, fetchCameraMedia } from './osint-camera-media.mjs';

// Only catalogue URLs are probed; this endpoint never accepts arbitrary destinations.
export async function probeCamera(id, base, { fetcher = fetch, signal } = {}) {
  const allowed = (value) => {
    const u = new URL(value, base),
      root = new URL('.', base);
    if (u.origin !== root.origin || !u.pathname.startsWith(root.pathname))
      throw Error('Unsupported reference');
    const result = cameraMediaUrl(id, u.pathname.slice(root.pathname.length) + u.search);
    if (!result) throw Error('Unsupported reference');
    return result;
  };
  let url = base;
  for (let depth = 0; depth < 3; depth++) {
    const response = await fetchCameraMedia(url, { signal }, fetcher);
    if (!response.ok) {
      await response.body?.cancel();
      throw Error('Playlist unavailable');
    }
    let size = 0,
      text = '';
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 262144) throw Error('Manifest too large');
      text += decoder.decode(chunk, { stream: true });
    }
    text += decoder.decode();
    if (!text.trimStart().startsWith('#EXTM3U')) throw Error('Invalid manifest');
    const lines = text
        .trimStart()
        .split(/\r?\n/)
        .map((line) => line.trim()),
      media = lines.filter((l) => l.trim() && !l.startsWith('#'));
    if (!media.length) throw Error('Empty playlist');
    if (text.includes('#EXT-X-STREAM-INF')) {
      url = allowed(new URL(media[0], url));
      continue;
    }
    if (text.includes('#EXT-X-ENDLIST')) throw Error('Stream ended');
    const last = media.at(-1),
      segment = allowed(new URL(last, url));
    const sample = await fetchCameraMedia(
      segment,
      {
        signal,
        redirect: 'error',
        headers: { Range: 'bytes=0-1023' },
      },
      fetcher,
    );
    if (!sample.ok) {
      await sample.body?.cancel();
      throw Error('Segment unavailable');
    }
    const reader = sample.body?.getReader();
    if (!reader) throw Error('Missing segment');
    try {
      const first = await reader.read();
      if (first.done || !first.value?.length) throw Error('Empty segment');
      const head = new TextDecoder().decode(first.value.slice(0, 100)).trimStart();
      if (head.startsWith('<') || head.startsWith('{')) throw Error('Invalid segment');
    } finally {
      await reader.cancel();
    }
    return {
      fingerprint: (text.match(/#EXT-X-MEDIA-SEQUENCE:(.*)/)?.[1] || '') + '|' + last,
      staleAfter: Math.max(
        90000,
        Number(text.match(/#EXT-X-TARGETDURATION:(\d+)/)?.[1] || 15) * 4000,
      ),
    };
  }
  throw Error('Too many playlists');
}
export function createCameraHealthMonitor({
  catalogue = cameras,
  probe = probeCamera,
  now = Date.now,
  interval = 60000,
  lease = 45000,
} = {}) {
  const manualRetries = new Map();
  const records = new Map(),
    busy = new Set(),
    hosts = new Map();
  let lastClient = 0,
    timer;
  const tick = () => {
    if (now() - lastClient > lease || busy.size >= 4) return;
    for (const [id, url] of [...catalogue].sort(
      (a, b) =>
        (records.get(a[0])?.checkedAt ?? -Infinity) - (records.get(b[0])?.checkedAt ?? -Infinity),
    )) {
      if (busy.size >= 4) break;
      const old = records.get(id);
      if (
        busy.has(id) ||
        old?.status === 'offline' ||
        (old && now() - old.checkedAt < interval) ||
        (hosts.get(url.origin) || 0) >= 2
      )
        continue;
      busy.add(id);
      hosts.set(url.origin, (hosts.get(url.origin) || 0) + 1);
      void (async () => {
        const controller = new AbortController(),
          timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const result = await probe(id, url, { signal: controller.signal });
          const at = now();
          const unchanged = old?.fingerprint === result.fingerprint;
          const changedAt = unchanged ? old.changedAt : at;
          if (unchanged && at - changedAt > result.staleAfter)
            throw Error('Playlist stopped advancing');
          records.set(id, {
            status: 'online',
            checkedAt: at,
            reason: 'Playlist dan segmen tersedia; bukan verifikasi gambar',
            failures: 0,
            fingerprint: result.fingerprint,
            changedAt,
          });
        } catch (error) {
          const unsupported =
            error.message === 'Unsupported reference' || error.message === 'Too many playlists';
          const failures = unsupported ? 0 : (old?.failures || 0) + 1;
          records.set(id, {
            ...old,
            status: failures >= 2 ? 'offline' : 'unknown',
            checkedAt: now(),
            failures,
            reason: unsupported
              ? 'Format stream belum didukung pemeriksa; bukan konfirmasi offline'
              : failures >= 2
                ? 'Dua pemeriksaan stream gagal atau playlist tidak bergerak'
                : 'Pemeriksaan gagal; menunggu konfirmasi',
          });
        } finally {
          clearTimeout(timeout);
          busy.delete(id);
          hosts.set(url.origin, (hosts.get(url.origin) || 1) - 1);
        }
      })();
    }
  };
  return {
    retry(id) {
      if (!catalogue.has(id)) return false;
      const last = manualRetries.get(id);
      if (last !== undefined && now() - last < 30000) return false;
      if (busy.has(id)) return false;
      manualRetries.set(id, now());
      records.delete(id);
      lastClient = now();
      tick();
      return true;
    },
    snapshot() {
      lastClient = now();
      if (!timer) {
        timer = setInterval(tick, 1000);
        timer.unref?.();
      }
      tick();
      return {
        health: Object.fromEntries(
          [...records].map(([id, r]) => [
            id,
            {
              status:
                r.status === 'offline'
                  ? 'offline'
                  : now() - r.checkedAt > 300000
                    ? 'unknown'
                    : r.status,
              checkedAt: r.checkedAt,
              reason: r.reason,
            },
          ]),
        ),
        checked: records.size,
        total: catalogue.size,
        checking: busy.size,
      };
    },
    close() {
      clearInterval(timer);
      timer = undefined;
      lastClient = -Infinity;
    },
  };
}
const monitor = createCameraHealthMonitor();
export function serveOsintCameraHealth(req, res) {
  if (req.method === 'POST') {
    const id = new URL(req.url, 'http://local').searchParams.get('id');
    const accepted = id && monitor.retry(id);
    res.writeHead(accepted ? 202 : 429, { 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(monitor.snapshot()));
}
