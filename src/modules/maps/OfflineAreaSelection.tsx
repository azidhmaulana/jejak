import { useEffect, useRef, useState } from 'react';
import type * as maplibregl from 'maplibre-gl';
import { Check, RotateCcw, X } from 'lucide-react';
import { useOfflineSelection } from './offlineSelectionStore';
import { offlineSelectionBounds, type OfflineBounds } from './offlineSelection';
import { useMapTools } from '../drawing/mapToolsStore';
import { t } from '../../shared/i18n/runtime.js';
import { useLanguage } from '../../shared/i18n/useLanguage';
import './OfflineAreaSelection.css';

type Point = { x: number; y: number };
export default function OfflineAreaSelection({ map }: { map: maplibregl.Map }) {
  useLanguage();
  const overlay = useRef<HTMLDivElement>(null),
    anchor = useRef<Point | null>(null),
    pointerStart = useRef<Point | null>(null);
  const [bounds, setBounds] = useState<OfflineBounds | null>(null),
    [error, setError] = useState(''),
    [, redraw] = useState(0);
  const [drawing, setDrawing] = useState(true);
  const complete = useOfflineSelection((state) => state.finish);
  useEffect(() => {
    const previous = useMapTools.getState().mode;
    useMapTools.getState().controller?.mode('render');
    const move = () => redraw((value) => value + 1);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        complete(null);
      }
    };
    map.on('move', move);
    map.on('resize', move);
    window.addEventListener('keydown', escape);
    return () => {
      map.off('move', move);
      map.off('resize', move);
      window.removeEventListener('keydown', escape);
      useMapTools.getState().controller?.mode(previous);
    };
  }, [map, complete]);
  const point = (event: React.PointerEvent): Point => {
    const rect = overlay.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
    };
  };
  const update = (end: Point) => {
    if (!anchor.current) return null;
    const start = anchor.current;
    try {
      const next = offlineSelectionBounds(
        [start, { x: start.x, y: end.y }, end, { x: end.x, y: start.y }].map((p) =>
          map.unproject([p.x, p.y]),
        ),
      );
      setBounds(next);
      setError('');
      return next;
    } catch (cause) {
      setBounds(null);
      setError((cause as Error).message);
      return null;
    }
  };
  const finish = (end: Point) => {
    if (update(end)) {
      anchor.current = null;
      setDrawing(false);
    }
  };
  const currentView = () => {
    try {
      const b = map.getBounds();
      setBounds(
        offlineSelectionBounds([
          { lng: b.getWest(), lat: b.getSouth() },
          { lng: b.getEast(), lat: b.getNorth() },
        ]),
      );
      setError('');
      anchor.current = null;
      setDrawing(false);
    } catch (cause) {
      setError((cause as Error).message);
    }
  };
  const polygon = bounds
    ? [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[1]],
        [bounds[2], bounds[3]],
        [bounds[0], bounds[3]],
      ]
        .map((p) => {
          const point = map.project(p as [number, number]);
          return `${point.x},${point.y}`;
        })
        .join(' ')
    : '';
  return (
    <>
      <div
        ref={overlay}
        className={'offline-area-selection' + (drawing ? ' is-drawing' : '')}
        aria-label={t('Offline map area selection')}
        onPointerDown={(event) => {
          if (!drawing || event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          overlay.current?.setPointerCapture(event.pointerId);
          const p = point(event);
          pointerStart.current = p;
          if (anchor.current) {
            finish(p);
          } else {
            anchor.current = p;
            setBounds(null);
            setError('');
          }
        }}
        onPointerMove={(event) => {
          if (drawing && anchor.current) update(point(event));
        }}
        onPointerUp={(event) => {
          if (drawing && anchor.current && pointerStart.current) {
            const p = point(event);
            if (Math.hypot(p.x - pointerStart.current.x, p.y - pointerStart.current.y) > 5)
              finish(p);
          }
          pointerStart.current = null;
        }}
        onPointerCancel={() => {
          anchor.current = null;
          pointerStart.current = null;
          setBounds(null);
        }}
      >
        <svg aria-hidden="true">{polygon && <polygon points={polygon} />}</svg>
      </div>
      <section className="offline-area-toolbar corner-frame" aria-label={t('Download offline map')}>
        <header>
          <strong>{t('SELECT DOWNLOAD AREA')}</strong>
          <button
            type="button"
            aria-label={t('Cancel area selection')}
            onClick={() => complete(null)}
          >
            <X size={14} />
          </button>
        </header>
        <p>
          {t(
            drawing
              ? 'Drag a rectangle on the map, or click two opposite corners.'
              : 'Area selected. Continue to choose provider and maximum zoom.',
          )}
        </p>
        {bounds && (
          <output translate="no">{bounds.map((value) => value.toFixed(5)).join(' / ')}</output>
        )}
        {error && (
          <p className="offline-area-error" role="status">
            {t(error)}
          </p>
        )}
        <div className="offline-area-actions">
          <button type="button" onClick={currentView}>
            {t('Use visible area')}
          </button>
          <button
            type="button"
            title={t('Select again')}
            onClick={() => {
              anchor.current = null;
              setBounds(null);
              setError('');
              setDrawing(true);
            }}
          >
            <RotateCcw size={12} />
            {t('Select again')}
          </button>
          <button
            type="button"
            disabled={!bounds || drawing}
            onClick={() => bounds && complete(bounds)}
          >
            <Check size={12} />
            {t('Use selected area')}
          </button>
        </div>
      </section>
    </>
  );
}
