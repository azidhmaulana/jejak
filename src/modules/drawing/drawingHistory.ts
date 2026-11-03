import {
  cleanProject,
  diff,
  rebase,
  sameValue,
  type Changes,
  type DrawingProject,
} from './sharedDrawingProject';

/** Local entity deltas preserve unrelated edits received from other clients. */
export function createDrawingHistory(initial: DrawingProject) {
  let checkpoint = cleanProject(initial);
  const undo: Changes[] = [],
    redo: Changes[] = [];
  return {
    get canUndo() {
      return undo.length > 0;
    },
    get canRedo() {
      return redo.length > 0;
    },
    adopt(project: DrawingProject) {
      checkpoint = cleanProject(project);
    },
    capture(project: DrawingProject) {
      const next = cleanProject(project),
        changes = diff(checkpoint, next);
      checkpoint = next;
      if (!changes.features.length && !changes.folders.length) return;
      undo.push(changes);
      redo.length = 0;
      // Bound history by both steps and memory for drawings with many vertices.
      while (undo.length > 50 || (undo.length > 1 && JSON.stringify(undo).length > 16_000_000))
        undo.shift();
    },
    move(project: DrawingProject, direction: 'undo' | 'redo'): DrawingProject | null {
      const source = direction === 'undo' ? undo : redo,
        target = direction === 'undo' ? redo : undo;
      const entry = source[source.length - 1];
      if (!entry) return null;
      const current = cleanProject(project);
      for (const kind of ['features', 'folders'] as const) {
        for (const change of entry[kind]) {
          const expected = direction === 'undo' ? change.after : change.before;
          if (!sameValue(current[kind].find((item) => item.id === change.id) || null, expected)) {
            throw Error(
              'Objek sudah berubah di client lain. Undo/Redo ini tidak diterapkan agar perubahan terbaru tetap aman.',
            );
          }
        }
      }
      const inverse: Changes = {
        version: 2,
        features: entry.features.map((c) => ({ ...c, before: c.after, after: c.before })),
        folders: entry.folders.map((c) => ({ ...c, before: c.after, after: c.before })),
      };
      const next = rebase(current, direction === 'undo' ? inverse : entry);
      source.pop();
      target.push(entry);
      checkpoint = next;
      return next;
    },
  };
}
