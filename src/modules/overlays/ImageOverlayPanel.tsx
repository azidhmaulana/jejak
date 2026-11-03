import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Save, X, Lock, Unlock, Eye, EyeOff, Pencil, Trash2, Crosshair } from 'lucide-react';
import { overlayRequest, useOverlays, type Overlay } from './imageOverlayStore';
import { useMapTools } from '../drawing/mapToolsStore';
import './ImageOverlayPanel.css';
import HudAccent from '../../shared/components/HudAccent';
import { useDraggableDialog } from '../../shared/hooks/useDraggableDialog';
export default function ImageOverlayPanel() {
  const { items, draft, open, hidden, error, editable } = useOverlays();
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const baseline = useRef<Overlay | null>(null);
  if (draft?.id !== baseline.current?.id) baseline.current = draft ? { ...draft } : null;
  useDraggableDialog(dialog);
  useEffect(() => {
    if (open) dialog.current?.show();
    else dialog.current?.close();
  }, [open]);
  const close = () => {
    if (!busy) useOverlays.setState({ open: false, draft: null, error: '' });
  };
  const update = (value: Partial<Overlay>) => {
    if (draft && !draft.locked && editable) useOverlays.setState({ draft: { ...draft, ...value } });
  };
  const request = async (id: string, method: string, body: unknown) => {
    setBusy(true);
    try {
      await overlayRequest(id, method, body);
      useOverlays.setState({ draft: null });
    } catch (e) {
      useOverlays.setState({ error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const add = () => {
    const b = useOverlays.getState().viewport;
    useOverlays.setState({
      draft: {
        id: 'new',
        revision: '',
        name: '',
        description: '',
        image: '',
        west: 106.8,
        east: 106.82,
        south: -6.22,
        north: -6.2,
        rotation: 0,
        opacity: 0.7,
        locked: false,
        ...(b
          ? {
              west: b.west + (b.east - b.west) * 0.25,
              east: b.east - (b.east - b.west) * 0.25,
              south: b.south + (b.north - b.south) * 0.25,
              north: b.north - (b.north - b.south) * 0.25,
            }
          : {}),
      },
      error: '',
    });
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      )
        throw Error('Choose PNG, JPG or WebP up to 10 MB.');
      const bitmap = await createImageBitmap(file);
      if (bitmap.width > 4096 || bitmap.height > 4096) {
        bitmap.close();
        throw Error('Maximum image dimensions: 4096 x 4096.');
      }
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      bitmap.close();
      const image = canvas.toDataURL('image/png');
      if (image.length > 5600000)
        throw Error('Image is too large after conversion. Use a smaller image (up to 4 MB PNG).');
      update({ image });
      useOverlays.setState({ error: '' });
    } catch (e) {
      useOverlays.setState({ error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const numeric = (key: keyof Overlay, label: string, min: number, max: number, _step: number) => (
    <label>
      {label}
      <input
        type="number"
        required
        min={min}
        max={max}
        step="any"
        value={Number(draft![key])}
        onChange={(e) => update({ [key]: e.target.valueAsNumber })}
      />
    </label>
  );
  const shift = (axis: 'longitude' | 'latitude', value: number) => {
    if (!draft) return;
    const w = draft.east - draft.west,
      h = draft.north - draft.south;
    update(
      axis === 'longitude'
        ? { west: value - w / 2, east: value + w / 2 }
        : { south: value - h / 2, north: value + h / 2 },
    );
  };
  return createPortal(
    <dialog
      ref={dialog}
      className={`image-overlay-dialog ops-draggable-dialog corner-frame${draft ? ' is-editing' : ''}`}
      aria-labelledby="image-overlay-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header data-dialog-handle>
        <strong id="image-overlay-title">
          {draft ? 'Image overlay settings' : 'Image overlays'}
        </strong>
        <HudAccent markers={false} />
        <button title="Close" aria-label="Close" onClick={close} disabled={busy}>
          <X />
        </button>
      </header>
      {error && (
        <p className="overlay-error" role="alert">
          {error}
        </p>
      )}
      {!draft ? (
        <>
          <div className="overlay-toolbar">
            <span>{items.length} saved overlays</span>
            <button disabled={!editable || busy} onClick={add}>
              <Plus /> Add overlay
            </button>
          </div>
          <div className="overlay-list">
            {!items.length && <p>No overlays saved yet.</p>}
            {items.map((item) => (
              <article key={item.id}>
                <img src={item.image} alt="" />
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.description}</p>
                  <small>{item.locked ? 'Locked' : 'Unlocked'}</small>
                </div>
                <nav>
                  <button
                    title={hidden.includes(item.id) ? 'Show' : 'Hide'}
                    onClick={() =>
                      useOverlays.setState({
                        hidden: hidden.includes(item.id)
                          ? hidden.filter((x) => x !== item.id)
                          : [...hidden, item.id],
                      })
                    }
                  >
                    {hidden.includes(item.id) ? <EyeOff /> : <Eye />}
                  </button>
                  <button
                    title="Locate"
                    onClick={() => {
                      useMapTools
                        .getState()
                        .controller?.focus(
                          (item.west + item.east) / 2,
                          (item.south + item.north) / 2,
                        );
                      close();
                    }}
                  >
                    <Crosshair />
                  </button>
                  <button
                    title="Edit overlay"
                    disabled={busy || item.locked || !editable}
                    onClick={() => useOverlays.setState({ draft: { ...item }, error: '' })}
                  >
                    <Pencil />
                  </button>
                  <button
                    title={item.locked ? 'Unlock overlay' : 'Lock overlay'}
                    disabled={busy || !editable}
                    onClick={() =>
                      void request(item.id, 'PATCH', {
                        revision: item.revision,
                        locked: !item.locked,
                      })
                    }
                  >
                    {item.locked ? <Lock /> : <Unlock />}
                  </button>
                  <button
                    title="Delete overlay"
                    disabled={busy || item.locked || !editable}
                    onClick={() => {
                      if (confirm('Delete ' + item.name + '?'))
                        void request(item.id, 'DELETE', { revision: item.revision });
                    }}
                  >
                    <Trash2 />
                  </button>
                </nav>
              </article>
            ))}
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void request(
              draft.id === 'new' ? '' : draft.id,
              draft.id === 'new' ? 'POST' : 'PUT',
              draft,
            );
          }}
        >
          <fieldset disabled={busy || draft.locked || !editable}>
            <div className="overlay-fields">
              <label>
                Name
                <input
                  required
                  maxLength={100}
                  value={draft.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </label>
              <label>
                Description
                <textarea
                  maxLength={2000}
                  value={draft.description}
                  onChange={(e) => update({ description: e.target.value })}
                />
              </label>
              <label>
                Image (PNG / JPG / WebP)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
              </label>
              {draft.image && (
                <img className="overlay-preview" src={draft.image} alt="Overlay preview" />
              )}
              <div className="overlay-bounds">
                {numeric('west', 'West longitude', -180, 180, 0.000001)}
                {numeric('east', 'East longitude', -180, 180, 0.000001)}
                {numeric('south', 'South latitude', -85, 85, 0.000001)}
                {numeric('north', 'North latitude', -85, 85, 0.000001)}
              </div>
              <label>
                Horizontal position
                <input
                  type="range"
                  min={Math.max(
                    -180 + (draft.east - draft.west) / 2,
                    baseline.current!.west - (baseline.current!.east - baseline.current!.west),
                  )}
                  max={Math.min(
                    180 - (draft.east - draft.west) / 2,
                    baseline.current!.east + (baseline.current!.east - baseline.current!.west),
                  )}
                  step="0.00001"
                  value={(draft.west + draft.east) / 2}
                  onChange={(e) => shift('longitude', +e.target.value)}
                />
              </label>
              <label>
                Vertical position
                <input
                  type="range"
                  min={Math.max(
                    -85 + (draft.north - draft.south) / 2,
                    baseline.current!.south - (baseline.current!.north - baseline.current!.south),
                  )}
                  max={Math.min(
                    85 - (draft.north - draft.south) / 2,
                    baseline.current!.north + (baseline.current!.north - baseline.current!.south),
                  )}
                  step="0.00001"
                  value={(draft.north + draft.south) / 2}
                  onChange={(e) => shift('latitude', +e.target.value)}
                />
              </label>
              <label>
                Size
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step=".01"
                  value={
                    (draft.east - draft.west) / (baseline.current!.east - baseline.current!.west)
                  }
                  onChange={(e) => {
                    const scale = +e.target.value,
                      b = baseline.current!,
                      cx = (draft.west + draft.east) / 2,
                      cy = (draft.south + draft.north) / 2,
                      w = ((b.east - b.west) * scale) / 2,
                      h = ((b.north - b.south) * scale) / 2;
                    if (cx - w >= -180 && cx + w <= 180 && cy - h >= -85 && cy + h <= 85)
                      update({ west: cx - w, east: cx + w, south: cy - h, north: cy + h });
                  }}
                />
              </label>
              <label>
                Rotation: {draft.rotation}&deg;
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step=".1"
                  value={draft.rotation}
                  onChange={(e) => update({ rotation: +e.target.value })}
                />
              </label>
              <label>
                Opacity: {Math.round(draft.opacity * 100)}%
                <input
                  type="range"
                  min="0"
                  max="1"
                  step=".01"
                  value={draft.opacity}
                  onChange={(e) => update({ opacity: +e.target.value })}
                />
              </label>
              <p>
                Drag the image on the map or use the sliders to align it. Changes preview on the
                map. Save to keep them; Cancel discards changes. Unlock from the list before
                editing.
              </p>
            </div>
          </fieldset>
          <footer>
            <button
              type="button"
              disabled={busy}
              onClick={() => useOverlays.setState({ draft: null, error: '' })}
            >
              <X /> Cancel
            </button>
            <button disabled={busy || draft.locked || !editable || !draft.image}>
              <Save /> {busy ? 'Saving...' : 'Save overlay'}
            </button>
          </footer>
        </form>
      )}
    </dialog>,
    document.body,
  );
}
