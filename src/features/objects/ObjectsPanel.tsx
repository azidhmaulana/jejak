import { toast } from '../../shared/components/Toast';
import DrawingObjectRow from './DrawingObjectRow';
import { drawingSummary } from './drawingSummary';

import { useEffect, useState } from 'react';

import { Circle, Hexagon, MapPin, MousePointer2, Slash, Square, X, Download, Trash2, Save, Scan } from 'lucide-react';


import { useMapTools } from '../../modules/drawing/mapToolsStore';





import { useLanguage } from '../../shared/i18n/useLanguage';

import { useAuth } from '../auth/authStore';

import { useWorkspace } from '../osint/workspaceStore';

import './ObjectsPanel.css';



const tools = [

  ['polygon', Hexagon, 'Area', 'Area', 'Klik setiap sudut', 'Click each corner'],

  ['rectangle', Square, 'Kotak', 'Box', 'Dua sudut berseberangan', 'Two opposite corners'],

  ['circle', Circle, 'Radius', 'Radius', 'Titik pusat, lalu radius', 'Centre, then distance out'],

  ['linestring', Slash, 'Jalur', 'Path', 'Klik dua kali untuk selesai', 'Double-click to finish'],

  ['point', MapPin, 'Titik', 'Point', 'Klik lokasi di peta', 'Click a map location'],

  ['select', MousePointer2, 'Pilih / edit', 'Select / edit', 'Pilih objek di peta', 'Select a map object'],

] as const;



export default function ObjectsPanel() {

  const english = useLanguage() === 'en';

  const tx = (id: string, en: string) => english ? en : id;

  const editable = useAuth((s) => Boolean(s.user?.permissions.includes('objects.write')));

  const { controller, mode, features, notice, syncMessage, completedId } = useMapTools();


  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    if (completedId === null) return;
    const timer = window.setTimeout(() => {
      if (useMapTools.getState().completedId === completedId)
        useMapTools.setState({ completedId: null });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [completedId]);



  const summary = drawingSummary(features);

  const drawing = mode !== 'render' && mode !== 'select';

  return (

    <aside className="public-analytics objects-panel" data-completed={completedId !== null && features.some(f => f.id === completedId)} aria-label={tx('Alat gambar', 'Drawing tools')}>

      <header className="public-analytics-heading">

        <Scan size={19} /><h2>{tx('Alat Gambar', 'Drawing Tools')}</h2>

        <button className="analytics-close" aria-label={tx('Tutup objek', 'Close objects')} onClick={() => { controller?.mode('render'); useWorkspace.setState({ panel: null }); }}><X size={12} /></button>

      </header>

      <div className="public-analytics-body objects-panel-body">

        <div className="drawing-summary"><span>{tx('TOTAL LUAS', 'TRACKED AREA')}<strong>{summary.area.toFixed(2)} km<sup>2</sup></strong></span><span>{tx('TOTAL KELILING', 'TOTAL PERIMETER')}<strong>{summary.perimeter.toFixed(2)} km</strong></span></div>

        {editable && <>

          <p className="drawing-step">{drawing ? tx('LANGKAH 2 - KLIK PETA', 'STEP 2 - CLICK THE MAP') : tx('LANGKAH 1 - PILIH BENTUK', 'STEP 1 - CHOOSE A SHAPE')}</p>

          <div className="objects-draw-tools" role="group" aria-label={tx('Gambar objek', 'Draw an object')}>

            {tools.map(([value, Icon, id, en]) => <button key={value} aria-label={tx(id, en)} aria-pressed={mode === value} disabled={!controller} onClick={() => controller?.mode(value)}><Icon size={14} /><span><b>{tx(id, en)}</b></span></button>)}

          </div>


        </>}

        <div className="drawing-result-list">

          {[...features].reverse().map((feature) => <DrawingObjectRow key={feature.id} feature={feature} editable={editable} />)}

          {!features.length && <p>{tx('Belum ada objek. Pilih bentuk untuk mulai menggambar.', 'No objects yet. Choose a shape to start drawing.')}</p>}

        </div>

        {notice && <p className="drawing-notice" role="status">{notice}</p>}


        <small className="drawing-storage-note">{tx('Tersimpan hanya di browser ini, per akun.', 'Saved only in this browser, per account.')}</small>

        {syncMessage.includes('penuh') && <p role="alert">{syncMessage}</p>}

      </div>

      <footer className="drawing-panel-footer">

        <button disabled={!features.length} onClick={() => controller?.export()}><Download size={13} />{tx('EKSPOR GEOJSON', 'EXPORT GEOJSON')}</button>

        {editable && <button className="drawing-clear" disabled={!features.length} onClick={() => setConfirmClear(!confirmClear)}><Trash2 size={13} />{tx('HAPUS', 'CLEAR')}</button>}

        {editable && <button className="drawing-save" onClick={() => { controller?.save(); toast(useMapTools.getState().syncStatus === 'error' ? tx('Gagal menyimpan. Ekspor sebagai cadangan.', 'Save failed. Export a backup.') : tx('Drawing tersimpan di browser ini.', 'Drawings saved in this browser.')); }}><Save size={14} />{tx('Simpan', 'Save')}</button>}
        {confirmClear && <div className="drawing-clear-confirm"><span>{tx('Hapus semua objek?', 'Clear all objects?')}</span><button onClick={() => { controller?.clear(); setConfirmClear(false); }}>{tx('Ya, hapus', 'Yes, clear')}</button><button onClick={() => setConfirmClear(false)}>{tx('Batal', 'Cancel')}</button></div>}

      </footer>

    </aside>

  );

}
