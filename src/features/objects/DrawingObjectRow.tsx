import { useState } from 'react';
import MarkerEditor from './MarkerEditor';
import { Circle, Copy, Crosshair, Eye, EyeOff, Hexagon, Lock, MapPin, Pencil, Slash, Square, Trash2, Unlock } from 'lucide-react';
import { useMapTools, type Drawing } from '../../modules/drawing/mapToolsStore';
import { objectLocked, objectName } from '../../modules/drawing/drawingObjects';
import { drawingCursorMeasurement } from '../../modules/drawing/mapMeasurements';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { drawingSummary } from './drawingSummary';

export default function DrawingObjectRow({ feature, editable }: { feature: Drawing; editable: boolean }) {
  const { controller, selectedId } = useMapTools();
  const en = useLanguage() === 'en';
  const tx = (id: string, english: string) => en ? english : id;
  const id = feature.id!, name = objectName(feature), locked = objectLocked(feature);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);
  const [editing, setEditing] = useState(false);
  const rename = () => { if (draft.trim()) { controller?.updateDrawing(id, { name: draft.trim() }); setRenaming(false); } };
  const visible = feature.properties.bmsVisible !== false;
  const Icon = ({ point: MapPin, linestring: Slash, polygon: Hexagon, rectangle: Square, circle: Circle })[String(feature.properties.mode)] || MapPin;
  return <div className="drawing-object-row" data-selected={selectedId === id} style={{ borderLeftColor: String(feature.properties.drawColor || '#93ef6c') }}>
    <div className="drawing-object-heading">
      <button title={tx('Tampilkan / sembunyikan', 'Toggle visibility')} aria-label={`${tx('Visibilitas', 'Visibility')} ${name}`} aria-pressed={visible} disabled={!editable} onClick={() => controller?.updateDrawing(id, { visible: !visible })}>{visible ? <Eye /> : <EyeOff />}</button>
      {renaming ? <form className="drawing-rename" onSubmit={e => { e.preventDefault(); rename(); }}><input autoFocus aria-label={tx('Nama objek', 'Object name')} value={draft} required maxLength={80} onChange={e => setDraft(e.target.value)} onBlur={rename} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setRenaming(false); } }} /></form> : <button className="drawing-object-name" title={tx('Klik untuk mengganti nama', 'Click to rename')} aria-pressed={selectedId === id} onClick={() => { controller?.select(id); if (editable && !locked) { setDraft(name); setRenaming(true); } }}><Icon style={{ color: String(feature.properties.drawColor) }} /><b>{name}</b></button>}

    </div>
    <div className="drawing-object-bottom">
      <small>{feature.geometry.type === 'Polygon' ? `${drawingSummary([feature]).area.toFixed(2)} km²` : drawingCursorMeasurement(feature) || tx('Titik', 'Point')}</small>
      <div className="drawing-object-actions">
        <button title={tx('Kunci / buka kunci', 'Lock / unlock')} aria-label={`${tx('Kunci', 'Lock')} ${name}`} aria-pressed={locked} disabled={!editable} onClick={() => controller?.setLocked(id, !locked)}>{locked ? <Lock /> : <Unlock />}</button>
        <button title={tx('Fokus', 'Focus')} aria-label={`${tx('Fokus', 'Focus')} ${name}`} onClick={() => controller?.focusDrawing(id)}><Crosshair /></button>
        <button title={tx('Duplikat', 'Duplicate')} aria-label={`${tx('Duplikat', 'Duplicate')} ${name}`} disabled={!editable} onClick={() => controller?.duplicate(id)}><Copy /></button>
        {feature.geometry.type === 'Point' && <button title={tx('Edit marker', 'Edit marker')} aria-label={`Edit marker ${name}`} disabled={!editable || locked} onClick={() => { controller?.select(id); setEditing(true); }}><Pencil /></button>}
        <button title={tx('Hapus', 'Delete')} aria-label={`${tx('Hapus', 'Delete')} ${name}`} disabled={!editable || locked} onClick={() => controller?.remove(id)}><Trash2 /></button>
      </div>
    </div>
    {editing && <MarkerEditor feature={feature} onClose={() => setEditing(false)} />}
  </div>;
}