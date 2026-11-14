import { useRegion } from '../regions/regionStore';
import { installHotspotIcons } from './hotspotMarker';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Popup, type GeoJSONSource, type Map as LibreMap, type MapMouseEvent } from 'maplibre-gl';
import { X, ExternalLink } from 'lucide-react';
import { useMapTools } from '../../modules/drawing/mapToolsStore';
import { dismissMarkerPopup } from '../../shared/dismissMarkerPopup';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { useHotspots, visibleHotspots } from './hotspotStore';
import '../earthquakes/Earthquakes.css';
import './Hotspots.css';

const source = 'jejak-hotspots',
  layer = 'jejak-hotspot-markers',
  ring = 'jejak-hotspot-selected';
export default function HotspotLayer({ map }: { map: LibreMap | null }) {
  const region = useRegion();
  const state = useHotspots(),
    en = useLanguage() === 'en';
  const items = useMemo(() => visibleHotspots(state, region), [state, region]);
  const selected = state.selected && items.find((i) => i.id === state.selected?.id);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!map) return;
    let installed = false;
    const render = () => {
      if (installed && map.getSource(source)) return;
      if (!map.getSource(source) && !map.getStyle()?.sources) return;
      if (!map.getSource(source))
        map.addSource(source, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      installHotspotIcons(map);
      if (!map.getLayer(layer))
        map.addLayer({
          id: layer,
          source,
          type: 'symbol',
          layout: {
            'icon-image': ['concat', 'jejak-hotspot-fire-', ['get', 'confidence']],
            'icon-size': 0.5,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });
      if (!map.getLayer(ring))
        map.addLayer({
          id: ring,
          source,
          type: 'circle',
          paint: {
            'circle-radius': 10,
            'circle-opacity': 0,
            'circle-stroke-color': '#ffad42',
            'circle-stroke-width': 2,
          },
        });
      (map.getSource(source) as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: items.map((item) => ({
          type: 'Feature',
          properties: { id: item.id, confidence: item.confidence },
          geometry: { type: 'Point', coordinates: [item.lng, item.lat] },
        })),
      });
      map.setFilter(ring, ['==', ['get', 'id'], selected?.id || '']);
      installed = true;
    };
    const click = (e: MapMouseEvent) => {
      if (!['render', 'select'].includes(useMapTools.getState().mode) || !map.getLayer(layer))
        return;
      const id = map.queryRenderedFeatures(e.point, { layers: [layer] })[0]?.properties?.id;
      const item = items.find((i) => i.id === id);
      if (item) useHotspots.setState({ selected: item, playing: false });
    };
    render();
    map.on('style.load', render);
    map.on('idle', render);
    map.on('sourcedata', render);
    map.on('click', click);
    return () => {
      map.off('style.load', render);
      map.off('idle', render);
      map.off('sourcedata', render);
      map.off('click', click);
    };
  }, [map, items, selected?.id]);
  useEffect(() => {
    if (!map || !selected) return;
    map.flyTo({
      center: [selected.lng, selected.lat],
      zoom: Math.max(map.getZoom(), 7),
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700,
    });
  }, [map, selected?.id, selected?.lng, selected?.lat]);
  useEffect(() => {
    if (!map || !selected) {
      setHost(null);
      return;
    }
    const content = document.createElement('div');
    const popup = new Popup({
      className: 'earthquake-popup hotspot-popup',
      closeButton: false,
      closeOnClick: false,
      subpixelPositioning: false,
      maxWidth: '260px',
      offset: 15,
    })
      .setLngLat([selected.lng, selected.lat])
      .setDOMContent(content)
      .addTo(map);
    setHost(content);
    const close = () => useHotspots.setState({ selected: null });
    const dismiss = dismissMarkerPopup(() => popup.getElement(), close);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', key);
    return () => {
      dismiss();
      popup.remove();
      window.removeEventListener('keydown', key);
    };
  }, [map, selected]);
  useEffect(
    () => () => {
      if (!map) return;
      for (const id of [ring, layer]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(source)) map.removeSource(source);
    },
    [map],
  );
  if (!host || !selected) return null;
  return createPortal(
    <section
      className="quake-popup-card"
      role="dialog"
      aria-label={en ? 'Hotspot details' : 'Detail titik panas'}
      translate="no"
    >
      <header className="quake-popup-heading">
        <h3>{en ? 'HOTSPOT' : 'TITIK PANAS'}</h3>
        <button
          className="quake-popup-close"
          aria-label={en ? 'Close hotspot details' : 'Tutup detail titik panas'}
          onClick={() => useHotspots.setState({ selected: null })}
        >
          <X size={12} />
        </button>
      </header>
      <div className="quake-popup-body">
        <p className="quake-popup-place">
          {selected.place || `${selected.lat.toFixed(4)}, ${selected.lng.toFixed(4)}`}
        </p>
        <time>
          {new Date(selected.time).toLocaleString(en ? 'en-GB' : 'id-ID')} (
          {Intl.DateTimeFormat().resolvedOptions().timeZone})
        </time>
        <dl>
          <div>
            <dt>{en ? 'SATELLITE' : 'SATELIT'}</dt>
            <dd>{selected.satellite}</dd>
          </div>
          <div>
            <dt>{en ? 'CONFIDENCE' : 'KEPERCAYAAN'}</dt>
            <dd>
              {en
                ? selected.confidence
                : { high: 'Tinggi', medium: 'Sedang', low: 'Rendah', unknown: 'Tidak diketahui' }[
                    selected.confidence
                  ]}
            </dd>
          </div>
          <div>
            <dt>FRP</dt>
            <dd>{selected.frp === null ? '—' : `${selected.frp} MW`}</dd>
          </div>
          <div>
            <dt>{en ? 'COORDINATES' : 'KOORDINAT'}</dt>
            <dd>
              {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
            </dd>
          </div>
        </dl>
        <small>
          {en
            ? 'Satellite heat detection, not a confirmed fire.'
            : 'Deteksi panas satelit, bukan kebakaran terkonfirmasi.'}
        </small>
      </div>
      <footer className="quake-popup-footer">
        {selected.providers.map((id) => (
          <a
            key={id}
            href={
              id === 'firms'
                ? 'https://firms.modaps.eosdis.nasa.gov/'
                : 'https://sipongi.gakkum.kehutanan.go.id/peta'
            }
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={11} />
            {id === 'firms' ? 'NASA FIRMS' : 'SIPONGI'}
          </a>
        ))}
      </footer>
    </section>,
    host,
  );
}
