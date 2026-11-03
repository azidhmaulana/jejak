import { useEffect, useState } from 'react';
import { useMapTools, type Drawing } from '../drawing/mapToolsStore';
import { geometryValues } from '../drawing/drawingGeometry';
import { objectZone } from '../drawing/drawingObjects';

export default function ObjectGeometryFields({ feature }: { feature: Drawing }) {
  const controller = useMapTools((s) => s.controller);
  const values = () => {
    const value = geometryValues(feature);
    return {
      longitude: value.longitude.toFixed(7),
      latitude: value.latitude.toFixed(7),
      size: value.size?.toFixed(2) || '',
      height: value.height?.toFixed(2) || '',
    };
  };
  const [fields, setFields] = useState(values),
    [error, setError] = useState('');
  const geometry = JSON.stringify(feature.geometry);
  useEffect(() => {
    setFields(values());
    setError('');
  }, [geometry]);
  const mode = String(feature.properties.mode),
    zone = objectZone(feature);
  const field = (key: keyof typeof fields, label: string, min: number, max: number) => (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        step="any"
        min={min}
        max={max}
        value={fields[key]}
        onChange={(e) => setFields((current) => ({ ...current, [key]: e.target.value }))}
      />
    </label>
  );
  const apply = () => {
    if (
      fields.longitude.trim() === '' ||
      fields.latitude.trim() === '' ||
      (mode !== 'point' && !fields.size.trim()) ||
      (mode === 'rectangle' && !fields.height.trim())
    ) {
      setError('Lengkapi koordinat dan ukuran.');
      return;
    }
    const error = controller?.updateGeometry(feature.id!, {
      longitude: Number(fields.longitude),
      latitude: Number(fields.latitude),
      ...(mode !== 'point' ? { size: Number(fields.size) } : {}),
      ...(mode === 'rectangle' ? { height: Number(fields.height) } : {}),
    });
    setError(error || '');
  };
  return (
    <>
      {feature.geometry.type === 'Polygon' && feature.geometry.coordinates.length > 1 && (
        <p className="bms-object-hint">
          Polygon dengan lubang: ubah posisi/ukuran di sini. Edit titik di peta belum tersedia.
        </p>
      )}
      <div className="bms-geometry-fields">
        {field('latitude', 'LATITUDE PUSAT', -85, 85)}
        {field('longitude', 'LONGITUDE PUSAT', -180, 180)}
        {mode !== 'point' &&
          field(
            'size',
            mode === 'circle'
              ? 'RADIUS (m)'
              : mode === 'rectangle'
                ? 'PANJANG (m)'
                : mode === 'linestring'
                  ? 'JARAK (m)'
                  : 'KELILING (m)',
            0.01,
            1000000,
          )}
        {mode === 'rectangle' && field('height', 'LEBAR (m)', 0.01, 1000000)}
      </div>
      <button type="button" onClick={apply}>
        Terapkan koordinat / ukuran
      </button>
      {error && (
        <p role="alert" className="bms-properties-error">
          {error}
        </p>
      )}
      <div className="bms-property-zones" role="group" aria-label="Zona objek">
        <button
          type="button"
          aria-pressed={zone === 'guard'}
          disabled={zone === 'white'}
          onClick={() =>
            controller?.updateDrawing(feature.id!, { zone: zone === 'guard' ? 'none' : 'guard' })
          }
        >
          Guard Zone
        </button>
        <button
          type="button"
          aria-pressed={zone === 'white'}
          disabled={zone === 'guard'}
          onClick={() =>
            controller?.updateDrawing(feature.id!, { zone: zone === 'white' ? 'none' : 'white' })
          }
        >
          White Zone
        </button>
      </div>
    </>
  );
}
