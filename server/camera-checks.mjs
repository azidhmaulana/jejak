import { randomUUID } from 'node:crypto';
import { publicCameras } from './camera-catalog.mjs';
import { cameras, fetchCameraMedia } from './osint-camera-media.mjs';
import { probeCamera, recordCameraCheck } from './osint-camera-health.mjs';
import { resolveTollStream, validTollReplacement } from './toll-streams.mjs';

// No caller-provided destinations: the check queue comes exclusively from the server catalog.
export async function checkCamera(
  camera,
  {
    probe = probeCamera,
    resolve = resolveTollStream,
    fetcher = fetch,
    current = cameras.get(camera.id),
  } = {},
) {
  const check = (url) =>
    probe(camera.id, url, {
      refresh: false,
      signal: AbortSignal.timeout(12000),
    });
  if (camera.streamUrl) {
    const original = current || new URL(camera.streamUrl);
    // A retired URL may still serve an old playlist. Prefer the current official listing.
    let candidate;
    let reason;
    if (camera.url?.startsWith('https://binamarga.pu.go.id/contents/cctv_tol')) {
      try { candidate = await resolve(camera.id, original); } catch { candidate = null; }
      if (candidate && validTollReplacement(camera, candidate)) {
        try {
          await check(candidate);
          return { status: 'updated', url: candidate.href, oldUrl: original.href };
        } catch (error) {
          reason = error.message === 'Empty manifest' ? 'replacement_empty' : 'replacement_unavailable';
        }
      }
    }
    try {
      await check(original);
      return { status: 'online', url: original.href };
    } catch (error) {
      reason ||= error.message === 'Empty manifest' ? 'empty_manifest' : 'stream_unavailable';
    }
    const next = candidate === undefined ? await resolve(camera.id, original) : null;
    if (next && validTollReplacement(camera, next)) {
      try {
        await check(next);
        return { status: 'updated', url: next.href, oldUrl: original.href };
      } catch {
        /* Never install a candidate whose media probe failed. */
      }
    }
    return { status: 'failed', reason };
  }
  if (camera.previewUrl) {
    try {
      const response = await fetchCameraMedia(
        new URL(camera.previewUrl),
        {
          signal: AbortSignal.timeout(12000),
          headers: { Range: 'bytes=0-1023' },
        },
        fetcher,
      );
      try {
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/'))
          throw Error();
        const reader = response.body?.getReader();
        if (!reader) throw Error();
        try {
          const first = await reader.read();
          if (first.done || !first.value?.length) throw Error();
        } finally {
          await reader.cancel();
        }
        return { status: 'online' };
      } finally {
        if (!response.body?.locked) await response.body?.cancel();
      }
    } catch {
      return { status: 'failed' };
    }
  }
  return { status: 'skipped' };
}

export async function createCameraChecks(
  db,
  { catalogue = publicCameras, check = checkCamera, now = Date.now } = {},
) {
  const known = new Map(catalogue.map((c) => [c.id, c]));
  for (const row of await db
    .prepare('SELECT camera_id,stream_url FROM camera_stream_overrides')
    .all()) {
    if (validTollReplacement(known.get(row.camera_id) || {}, row.stream_url))
      cameras.set(row.camera_id, new URL(row.stream_url));
  }
  let task,
    closing = false;
  const expire = () =>
    db.query(
      "UPDATE camera_check_jobs SET status='interrupted', summary=jsonb_set(summary,'{status}','\"interrupted\"') WHERE status='running' AND updated_at < ?",
      [now() - 60000],
    );
  const latest = async () => {
    await expire();
    return (
      (
        await db
          .prepare('SELECT summary FROM camera_check_jobs ORDER BY updated_at DESC LIMIT 1')
          .get()
      )?.summary || null
    );
  };
  const save = (job) =>
    db.query(
      "UPDATE camera_check_jobs SET status=?,updated_at=?,summary=?::jsonb WHERE id=? AND status='running'",
      [job.status, now(), JSON.stringify(job), job.id],
    );
  async function run(job, queue) {
    const heartbeat = setInterval(() => {
      void db
        .query("UPDATE camera_check_jobs SET updated_at=? WHERE id=? AND status='running'", [
          now(),
          job.id,
        ])
        .catch(() => {});
    }, 5000);
    let cursor = 0;
    // Two workers total, including a maximum of two requests to any provider.
    // Serialize commits to avoid out-of-order progress writes.
    let commits = Promise.resolve();
    const worker = async () => {
      while (!closing && cursor < queue.length) {
        const camera = queue[cursor++];
        let result;
        try {
          result = await check(camera);
        } catch {
          result = { status: 'failed' };
        }
        commits = commits.then(async () => {
          await db.transaction(async () => {
            const lease = await db
              .prepare('SELECT status FROM camera_check_jobs WHERE id=? FOR UPDATE')
              .get(job.id);
            if (lease?.status !== 'running') throw Error('Check lease expired');
            if (
              result.status === 'online' &&
              result.url !== camera.streamUrl &&
              validTollReplacement(camera, result.url)
            ) {
              const saved = await db
                .prepare('SELECT stream_url FROM camera_stream_overrides WHERE camera_id=?')
                .get(camera.id);
              if (saved?.stream_url !== result.url)
                result = {
                  status: 'updated',
                  url: result.url,
                  oldUrl: saved?.stream_url || camera.streamUrl,
                };
            }
            if (result.status === 'updated') {
              if (!validTollReplacement(camera, result.url)) result = { status: 'failed' };
              else {
                await db.query(
                  'INSERT INTO camera_stream_overrides VALUES(?,?,?) ON CONFLICT(camera_id) DO UPDATE SET stream_url=excluded.stream_url,updated_at=excluded.updated_at',
                  [camera.id, result.url, now()],
                );
                await db.query(
                  'INSERT INTO camera_stream_history(camera_id,old_url,new_url,job_id,changed_at) VALUES(?,?,?,?,?)',
                  [camera.id, result.oldUrl, result.url, job.id, now()],
                );
              }
            }
            job.done++;
            job[result.status]++;
            job.logs.push({ at: now(), name: camera.name, status: result.status, ...(result.reason ? { reason: result.reason } : {}) });
            job.logs = job.logs.slice(-60);
            await save(job);
          });
          if (result.status === 'updated') cameras.set(camera.id, new URL(result.url));
          if (camera.streamUrl && result.status !== 'skipped')
            recordCameraCheck(camera.id, result.status === 'online' || result.status === 'updated');
        });
        await commits;
      }
    };
    try {
      const workers = await Promise.allSettled([worker(), worker()]);
      if (workers.some((r) => r.status === 'rejected')) throw Error('Check persistence failed');
      job.status = closing ? 'interrupted' : 'completed';
      job.finishedAt = now();
      await save(job);
    } catch {
      // Drain both workers before releasing shutdown; failed persistence must not report success.
      job.status = 'interrupted';
      await save(job).catch(() => {});
    } finally {
      clearInterval(heartbeat);
    }
  }
  return {
    latest,
    async start(provider, actor) {
      if (
        provider !== undefined &&
        (typeof provider !== 'string' ||
          !catalogue.some((c) => (c.provider || 'ATCS DISHUB BANDUNG') === provider))
      )
        throw Object.assign(Error('Unknown provider.'), { status: 400 });
      const queue = catalogue.filter(
        (c) =>
          c.kind === 'camera' && (!provider || (c.provider || 'ATCS DISHUB BANDUNG') === provider),
      );
      const job = {
        id: randomUUID(),
        status: 'running',
        provider: provider || null,
        total: queue.length,
        done: 0,
        online: 0,
        updated: 0,
        failed: 0,
        skipped: 0,
        startedAt: now(),
        logs: [],
      };
      await db.transaction(async () => {
        await db.query(
          "SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':camera-check'))",
        );
        await expire();
        if (await db.prepare("SELECT id FROM camera_check_jobs WHERE status='running'").get())
          throw Object.assign(Error('A stream check is already running.'), { status: 409 });
        const last = await db
          .prepare('SELECT updated_at FROM camera_check_jobs ORDER BY updated_at DESC LIMIT 1')
          .get();
        if (last && now() - last.updated_at < 30000)
          throw Object.assign(Error('Please wait 30 seconds before another check.'), {
            status: 429,
          });
        await db.query('INSERT INTO camera_check_jobs VALUES(?,?,?,?::jsonb)', [
          job.id,
          job.status,
          now(),
          JSON.stringify(job),
        ]);
        await db.query('INSERT INTO audit(time,actor,action,target) VALUES(?,?,?,?)', [
          now(),
          actor,
          'camera-source.check',
          provider || 'all',
        ]);
      });
      const initial = structuredClone(job);
      task = run(job, queue);
      return initial;
    },
    async close() {
      closing = true;
      await task;
    },
  };
}
