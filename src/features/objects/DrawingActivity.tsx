import { createPortal } from 'react-dom';
import { Check, Trash2, Undo2, X } from 'lucide-react';
import { useMapTools } from '../../modules/drawing/mapToolsStore';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { drawingCursorMeasurement } from '../../modules/drawing/mapMeasurements';
import { drawingSummary } from './drawingSummary';
import { objectLocked } from '../../modules/drawing/drawingObjects';
import ObjectEditFields, { ObjectEditName } from './ObjectEditFields';

export default function DrawingActivity() {
  const { mode, preview, controller, features, selectedId, inspectorOpen, canUndo, color } = useMapTools();
  const en = useLanguage() === 'en';
  const selected = features.find(f => f.id === selectedId);
  const editing = mode === 'select' && inspectorOpen && selected;
  if (mode === 'render' || (mode === 'select' && !editing)) return null;
  const kind = String(editing ? selected.properties.mode : mode);
  const polygon = kind === 'polygon', path = kind === 'linestring';
  const count = Number(preview?.properties.committedCoordinateCount || 0);
  const label = ({ polygon: 'AREA', rectangle: 'BOX', circle: 'CIRCLE', linestring: 'PATH', point: 'MARKER' } as Record<string, string>)[kind];
  const hints: Record<string, [string, string]> = {
    polygon: preview ? ['Klik sudut berikutnya atau selesaikan area.', 'Click more corners, or finish the area.'] : ['Klik sudut pertama area.', 'Click the first corner of your area.'],
    rectangle: preview ? ['Klik sudut seberangnya.', 'Click the opposite corner.'] : ['Klik sudut pertama kotak.', 'Click the first corner of your box.'],
    circle: preview ? ['Klik untuk menentukan radius.', 'Click to set the radius.'] : ['Klik pusat lingkaran.', 'Click the centre of your circle.'],
    linestring: preview ? ['Tambah titik atau selesaikan jalur.', 'Add points, or finish the path.'] : ['Klik titik awal jalur.', 'Click the first point of your path.'],
    point: ['Klik lokasi marker.', 'Click a location for your marker.'],
  };
  const measured = editing ? selected : preview;
  const summary = measured?.geometry.type === 'Polygon' ? drawingSummary([measured]) : null;
  const measurement = summary
    ? `${en ? 'Area' : 'Luas'} ${summary.area.toFixed(2)} km\u00b2 | ${en ? 'Perimeter' : 'Keliling'} ${summary.perimeter.toFixed(2)} km`
    : measured && measured.geometry.type !== 'Point' ? `${en ? 'Distance' : 'Jarak'} ${drawingCursorMeasurement(measured)}` : '';
  const locked = editing ? objectLocked(selected) : false;
  return createPortal(<section className="drawing-activity" aria-label={en ? 'Drawing activity' : 'Aktivitas menggambar'}>
    <div><strong><i />{label}{editing ? ' · EDIT' : ''}</strong>{editing && <><span aria-hidden="true">|</span><ObjectEditName key={selected.id} feature={selected} /><span aria-hidden="true">|</span></>}<span>{editing ? (locked ? (en ? 'Object is locked.' : 'Objek dikunci.') : (en ? 'Drag the object or its handles to edit.' : 'Geser objek atau titiknya untuk mengedit.')) : hints[kind]?.[en ? 1 : 0]}</span><b>{measurement}</b></div>
    <div className="drawing-activity-controls">
      <ObjectEditFields key={editing ? selected.id : mode} feature={editing ? selected : undefined} />
        <input type="color" aria-label={en ? 'Object colour' : 'Warna objek'} disabled={locked} value={editing ? String(selected.properties.drawColor || '#93ef6c') : color} onChange={e => controller?.style({ color: e.target.value })} />
      {editing ? <>
        <button className="drawing-action-icon" aria-label={en ? 'Undo' : 'Urungkan'} title={en ? 'Undo' : 'Urungkan'} disabled={!canUndo || locked} onClick={() => controller?.undo()}><Undo2 size={14} /></button>
      </> : (polygon || path) && <>
        <button className="drawing-action-icon" aria-label={en ? 'Undo point' : 'Urungkan titik'} title={en ? 'Undo point' : 'Urungkan titik'} disabled={!count} onClick={() => controller?.undoPoint()}><Undo2 size={14} /></button>
      </>}
      <div className="drawing-activity-actions">
        {editing && <button className="drawing-action-icon drawing-action-close" aria-label={en ? 'Delete object' : 'Hapus objek'} title={en ? 'Delete object' : 'Hapus objek'} disabled={locked} onClick={() => controller?.remove(selected.id!)}><Trash2 size={14} /></button>}
        {(editing || polygon || path) && <button className="drawing-action-icon drawing-action-done" aria-label={editing ? (en ? 'Done' : 'Selesai') : (en ? 'Finish' : 'Selesai')} title={en ? 'Done' : 'Selesai'} disabled={!editing && count < (polygon ? 3 : 2)} onClick={() => { if (editing) { controller?.save(); controller?.mode('render'); } else controller?.finish(); }}><Check size={14} /></button>}
        <button className="drawing-action-icon drawing-action-close" aria-label={editing ? (en ? 'Close' : 'Tutup') : (en ? 'Cancel' : 'Batal')} title={editing ? (en ? 'Close' : 'Tutup') : (en ? 'Cancel' : 'Batal')} onClick={() => controller?.mode('render')}><X size={14} /></button>
      </div>
    </div>
    {!editing && (polygon || path) && <small className="drawing-activity-help">{count} {en ? 'points | Double-click the map or press Enter to finish' : 'titik | Klik dua kali peta atau tekan Enter untuk selesai'}</small>}
  </section>, document.body);
}
