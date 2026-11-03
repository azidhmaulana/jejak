import { useRef, useState } from 'react';
import { useMapTools } from './mapToolsStore';
import { IMPORT_MAX_BYTES, parseDrawingImport, type DrawingImport } from './drawingImport';

export default function MapImportPanel({ onDone }: { onDone: () => void }) {
  const [preview, setPreview] = useState<DrawingImport | null>(null),
    [error, setError] = useState(''),
    [reading, setReading] = useState(false);
  const generation = useRef(0);
  const choose = async (file?: File) => {
    const current = ++generation.current;
    setPreview(null);
    setError('');
    setReading(false);
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) {
      setError('Maksimal ukuran file 5 MB.');
      return;
    }
    setReading(true);
    try {
      const text = await file.text();
      if (current === generation.current)
        setPreview(parseDrawingImport(text, file.name, useMapTools.getState()));
    } catch (error) {
      if (current === generation.current)
        setError(error instanceof Error ? error.message : 'File tidak dapat dibaca.');
    } finally {
      if (current === generation.current) setReading(false);
    }
  };
  const apply = () => {
    const controller = useMapTools.getState().controller;
    if (!preview || !controller) return;
    const error = controller.importDrawings(preview);
    if (error) setError(error);
    else onDone();
  };
  return (
    <div className="map-import-panel">
      <label>
        FILE KML / GEOJSON
        <input
          type="file"
          accept=".kml,.geojson,.json"
          aria-label="File import BMS"
          onChange={(event) => void choose(event.target.files?.[0])}
        />
      </label>
      <small>WGS84 · maksimal 5 MB / 500 objek. Multi geometry dipisahkan menjadi objek.</small>
      {reading && <p role="status">Memeriksa file…</p>}
      {error && (
        <p role="alert" className="bms-properties-error">
          {error}
        </p>
      )}
      {preview && (
        <>
          <strong translate="no">{preview.name}</strong>
          <p>
            {preview.features.length} objek · {preview.folders.length} group
          </p>
          <ul>
            {preview.features.slice(0, 5).map((feature) => (
              <li translate="no" key={feature.id}>
                {String(feature.properties.bmsName)} · {feature.geometry.type}
              </li>
            ))}
          </ul>
          {preview.features.length > 5 && (
            <small>+{preview.features.length - 5} objek lainnya</small>
          )}
          {preview.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          <button type="button" onClick={apply}>
            Tambahkan ke BMS
          </button>
        </>
      )}
    </div>
  );
}
