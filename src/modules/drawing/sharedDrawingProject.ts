import { drawingProjectUrl, mapStorageKey } from '../maps/mapWorkspace';
import { useMapTools, type Drawing, type DrawingFolder, type DrawingId } from './mapToolsStore';

export interface DrawingProject {
  version: 2;
  features: Drawing[];
  folders: DrawingFolder[];
}
interface Change<T> {
  id: DrawingId;
  before: T | null;
  after: T | null;
}
export interface Changes {
  version: 2;
  features: Change<Drawing>[];
  folders: Change<DrawingFolder>[];
}
const cacheKey = mapStorageKey('bms-map-project-v2'),
  baseKey = mapStorageKey('bms-map-shared-base-v1'),
  pendingKey = mapStorageKey('bms-map-pending-write-v1');
const empty = (): DrawingProject => ({ version: 2, features: [], folders: [] });
const stable = (value: unknown): string =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
export const sameProject = (a: DrawingProject, b: DrawingProject) => stable(a) === stable(b);
export const sameValue = (a: unknown, b: unknown) => stable(a) === stable(b);
export function cleanProject(project: DrawingProject): DrawingProject {
  const copy = structuredClone(project);
  for (const feature of copy.features) {
    delete feature.properties.selected;
    delete feature.properties.currentlyDrawing;
  }
  const order = (a: { id?: DrawingId }, b: { id?: DrawingId }) =>
    String(a.id).localeCompare(String(b.id));
  return { version: 2, features: copy.features.sort(order), folders: copy.folders.sort(order) };
}
export function diff(before: DrawingProject, after: DrawingProject): Changes {
  const changes = <T extends { id?: DrawingId }>(oldItems: T[], newItems: T[]): Change<T>[] => {
    const old = new Map(oldItems.map((item) => [item.id!, item])),
      next = new Map(newItems.map((item) => [item.id!, item]));
    return [...new Set([...old.keys(), ...next.keys()])].flatMap((id) => {
      const before = old.get(id) || null,
        after = next.get(id) || null;
      return stable(before) === stable(after) ? [] : [{ id, before, after }];
    });
  };
  return {
    version: 2,
    features: changes(before.features, after.features),
    folders: changes(before.folders, after.folders),
  };
}
export function rebase(remote: DrawingProject, changes: Changes): DrawingProject {
  const apply = <T extends { id?: DrawingId }>(items: T[], edits: Change<T>[]): T[] => {
    const result = new Map(items.map((item) => [item.id!, item]));
    for (const edit of edits)
      if (edit.after) result.set(edit.id, edit.after);
      else result.delete(edit.id);
    return [...result.values()];
  };
  return cleanProject({
    version: 2,
    features: apply(remote.features, changes.features),
    folders: apply(remote.folders, changes.folders),
  });
}

export function createSharedDrawingProject(
  read: () => DrawingProject,
  apply: (project: DrawingProject) => void,
  canApply: () => boolean,
) {
  let base = empty(),
    stopped = false,
    busy = false,
    blocked = false,
    timer = 0,
    forceRemote = false;
  let pending: { remote: DrawingProject; sent: DrawingProject } | null = null;
  let unacknowledged: { sent: DrawingProject; changes: Changes } | null = null;
  try {
    const saved = JSON.parse(localStorage.getItem(baseKey) || 'null');
    if (saved?.version === 2 && Array.isArray(saved.features) && Array.isArray(saved.folders))
      base = cleanProject(saved);
  } catch {
    /* Legacy browser-only drawings are migrated as new entities. */
  }
  try {
    const saved = JSON.parse(localStorage.getItem(pendingKey) || 'null');
    if (saved?.sent?.version === 2 && saved?.changes?.version === 2) unacknowledged = saved;
  } catch {
    /* The normal local snapshot remains available. */
  }
  const status = (
    syncStatus: ReturnType<typeof useMapTools.getState>['syncStatus'],
    syncMessage: string,
  ) => {
    if (!stopped) useMapTools.setState({ syncStatus, syncMessage });
  };
  const cache = (local: DrawingProject) => {
    try {
      localStorage.setItem(baseKey, JSON.stringify(base));
      localStorage.setItem(cacheKey, JSON.stringify(local));
    } catch {
      status('error', 'Cadangan browser penuh. Jangan tutup halaman sebelum data tersinkron.');
    }
  };
  const flush = () => {
    if (!pending || !canApply()) return;
    // Keep changes made while the request was in flight, including new drawings.
    const local = cleanProject(read()),
      next = rebase(pending.remote, diff(pending.sent, local));
    base = pending.remote;
    pending = null;
    if (!sameProject(local, next)) apply(next);
    cache(next);
    unacknowledged = null;
    try {
      localStorage.removeItem(pendingKey);
    } catch {
      /* An exact retry remains idempotent. */
    }
    status(
      sameProject(base, next) ? 'synced' : 'saving',
      sameProject(base, next)
        ? 'Tersimpan di server · dibagikan ke semua client.'
        : 'Menyimpan perubahan…',
    );
  };
  const tick = async () => {
    if (stopped || busy || blocked) return;
    if (pending) {
      flush();
      if (pending) return;
    }
    if (!canApply()) return;
    // After a timeout the server may already have committed. Retry that exact request
    // before sending newer local edits; otherwise a creation can look like a conflict.
    const sent = unacknowledged?.sent || cleanProject(read()),
      changes = unacknowledged?.changes || diff(base, sent),
      hasChanges = changes.features.length + changes.folders.length > 0;
    const write = hasChanges && !forceRemote;
    busy = true;
    if (write) status('saving', 'Menyimpan perubahan…');
    if (write && !unacknowledged) {
      unacknowledged = { sent, changes };
      try {
        localStorage.setItem(pendingKey, JSON.stringify(unacknowledged));
      } catch {
        /* Server save still proceeds; the regular cache reports storage failures. */
      }
    }
    try {
      const result = await fetch(drawingProjectUrl, {
        method: write ? 'PATCH' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        ...(write ? { body: JSON.stringify(changes) } : {}),
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      if (stopped) return;
      if (result.status === 409) {
        blocked = true;
        status(
          'conflict',
          'Objek yang sama berubah di client lain. Perubahan lokal tetap dicadangkan; muat versi server untuk melanjutkan.',
        );
        return;
      }
      if (result.status === 413 || result.status === 422) {
        blocked = true;
        status(
          'error',
          'Data belum diterima server. Salinan lokal tetap tersedia; periksa format atau batas ukuran gambar.',
        );
        return;
      }
      if (!result.ok) throw Error('Shared storage unavailable');
      const body = await result.json();
      if (stopped) return;
      if (body.version !== 2 || !Array.isArray(body.features) || !Array.isArray(body.folders))
        throw Error('Invalid project response');
      forceRemote = false;
      pending = { remote: cleanProject(body), sent };
      flush();
    } catch {
      status(
        'offline',
        'Server belum terhubung · perubahan disimpan lokal dan akan dicoba kembali.',
      );
    } finally {
      busy = false;
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void tick(), 350);
  };
  const reload = () => {
    if (busy) return;
    try {
      localStorage.setItem(
        mapStorageKey('bms-map-conflict-backup-v1'),
        JSON.stringify({ savedAt: new Date().toISOString(), base, project: cleanProject(read()) }),
      );
    } catch {
      status('error', 'Cadangan konflik gagal disimpan. Data lokal dipertahankan.');
      return;
    }
    blocked = false;
    forceRemote = true;
    pending = null;
    unacknowledged = null;
    try {
      localStorage.removeItem(pendingKey);
    } catch {
      /* Backup has already been saved. */
    }
    void tick();
  };
  const interval = window.setInterval(() => void tick(), 3000);
  window.addEventListener('online', schedule);
  useMapTools.setState({
    syncStatus: 'loading',
    syncMessage: 'Menghubungkan penyimpanan bersama…',
    reloadShared: reload,
  });
  schedule();
  return {
    save() {
      const local = cleanProject(read());
      cache(local);
      if (!blocked && !sameProject(base, local)) status('saving', 'Menyimpan perubahan…');
      schedule();
    },
    destroy() {
      cache(cleanProject(read()));
      stopped = true;
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('online', schedule);
      useMapTools.setState({ reloadShared: null });
    },
  };
}
