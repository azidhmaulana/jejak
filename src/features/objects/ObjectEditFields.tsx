import { useRef, useState } from 'react';
import { useMapTools, type Drawing, type FillStyle, type LineStyle } from '../../modules/drawing/mapToolsStore';
import { drawingStyle } from '../../modules/drawing/drawingStyle';
import { objectLocked, objectName } from '../../modules/drawing/drawingObjects';
import { useLanguage } from '../../shared/i18n/useLanguage';

export function ObjectEditName({ feature }: { feature: Drawing }) {
  const en = useLanguage() === 'en';
  const controller = useMapTools(s => s.controller);
  const locked = objectLocked(feature), name = objectName(feature);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);
  const cancelled = useRef(false);
  const commit = () => {
    if (!cancelled.current && draft.trim()) controller?.updateDrawing(feature.id!, { name: draft.trim() });
    setRenaming(false);
  };
  return <>
    {renaming ? <form className="drawing-bar-rename" onSubmit={e => { e.preventDefault(); commit(); }}>
      <input autoFocus aria-label={en ? 'Object name' : 'Nama objek'} required maxLength={80} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); cancelled.current = true; setRenaming(false); } }} />
    </form> : <button className="drawing-edit-name" title={en ? 'Click to rename' : 'Klik untuk mengganti nama'} disabled={locked} onClick={() => { cancelled.current = false; setDraft(name); setRenaming(true); }}><span>{name}</span></button>}
  </>;
}

export default function ObjectEditFields({ feature }: { feature?: Drawing }) {
  const en = useLanguage() === 'en';
  const controller = useMapTools(s => s.controller);
  const current = useMapTools();
  const locked = feature ? objectLocked(feature) : false;
  const style = feature ? drawingStyle(feature) : current;
  const isPolygon = feature ? feature.geometry.type === 'Polygon' : ['polygon', 'rectangle', 'circle'].includes(current.mode);
  const isPoint = feature ? feature.geometry.type === 'Point' : current.mode === 'point';
  const opacity = style.fillStyle === 'none' ? 0 : style.fillOpacity;
  const updateOpacity = (value: string) => {
    if (!value.trim()) return;
    const amount = Number(value);
    if (Number.isFinite(amount)) controller?.style({ fillOpacity: Math.min(100, Math.max(0, amount)), fillStyle: style.fillStyle === 'none' ? 'solid' : style.fillStyle });
  };
  return <>
    {isPolygon && <fieldset className="drawing-fill-controls" disabled={locked}>
      <label>{en ? 'Fill' : 'Isi'}<select aria-label={en ? 'Object fill' : 'Isi objek'} value={style.fillStyle === 'none' ? 'solid' : style.fillStyle} onChange={e => controller?.style({ fillStyle: e.target.value as FillStyle, fillOpacity: opacity })}>
        <option value="solid">{en ? 'Solid' : 'Polos'}</option>
        <option value="hatch">{en ? 'Hatch' : 'Arsir'}</option>
        <option value="crosshatch">{en ? 'Crosshatch' : 'Silang'}</option>
      </select></label>
      <label><input type="range" aria-label={en ? 'Object opacity' : 'Opasitas objek'} min="0" max="100" value={opacity} onChange={e => updateOpacity(e.target.value)} />
        <input type="number" aria-label={en ? 'Opacity percent' : 'Persen opasitas'} min="0" max="100" value={opacity} onChange={e => updateOpacity(e.target.value)} /><span>%</span>
      </label>
    </fieldset>}
    {!isPoint && <label className="drawing-border-control">{en ? 'Border' : 'Garis'}
      <select aria-label={en ? 'Border style' : 'Jenis garis'} disabled={locked} value={style.lineStyle} onChange={e => controller?.style({ lineStyle: e.target.value as LineStyle })}>
        <option value="dashed">{en ? 'Dashed' : 'Putus-putus'}</option>
        <option value="dotted">{en ? 'Dotted' : 'Titik-titik'}</option>
        <option value="solid">{en ? 'Solid' : 'Utuh'}</option>
      </select>
    </label>}
  </>;
}
