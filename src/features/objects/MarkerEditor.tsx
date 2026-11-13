import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useMapTools, type Drawing } from '../../modules/drawing/mapToolsStore';
import ObjectGeometryFields from '../../modules/maps/ObjectGeometryFields';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { objectLocked } from '../../modules/drawing/drawingObjects';

export default function MarkerEditor({ feature, onClose }: { feature: Drawing; onClose: () => void }) {
  const controller = useMapTools(s => s.controller);
  const en = useLanguage() === 'en';
  const style = (value: { color?: string; width?: number }) => { controller?.select(feature.id!); controller?.style(value); };
  return createPortal(<section className="drawing-marker-editor" role="dialog" aria-label="Edit marker" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <header><strong>Edit marker</strong><button aria-label={en ? 'Close marker editor' : 'Tutup editor marker'} onClick={onClose}><X size={14} /></button></header>
    <fieldset disabled={objectLocked(feature)}>
      <ObjectGeometryFields feature={feature} />
      <label>{en ? 'Colour' : 'Warna'}<input aria-label="Marker color" type="color" value={String(feature.properties.drawColor || '#93ef6c')} onChange={e => style({ color: e.target.value })} /></label>
      <label>{en ? 'Size' : 'Ukuran'}<input aria-label="Marker size" type="range" min="1" max="10" value={Number(feature.properties.drawWidth || 2)} onChange={e => style({ width: Number(e.target.value) })} /></label>
    </fieldset>
  </section>, document.body);
}
