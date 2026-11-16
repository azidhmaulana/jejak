import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Popup, type Map as LibreMap } from 'maplibre-gl';
import { ExternalLink, X } from 'lucide-react';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { quakeTime, useEarthquakes, type Earthquake } from './earthquakeStore';
import './Earthquakes.css';
import { dismissMarkerPopup } from '../../shared/dismissMarkerPopup';
import { snapPopupToPixels } from '../../shared/snapPopupToPixels';

export default function EarthquakePopup({ map, quake }: { map: LibreMap | null; quake: Earthquake | null }) {
  const en = useLanguage() === 'en';
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!map || !quake) { setHost(null); return; }
    const content = document.createElement('div');
    const popup = new Popup({ className: 'earthquake-popup', closeButton: false, closeOnClick: false, subpixelPositioning: false, maxWidth: '260px', offset: 22 })
      .setLngLat([quake.lng, quake.lat]).setDOMContent(content).addTo(map);
    setHost(content);
    const stopSnapping = snapPopupToPixels(popup.getElement());
    const removeDismiss = dismissMarkerPopup(() => popup.getElement(), () => {
      if (useEarthquakes.getState().selected?.id === quake.id) useEarthquakes.setState({ selected: null });
    });
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useEarthquakes.setState({ selected: null });
    };
    window.addEventListener('keydown', escape);
    return () => { stopSnapping(); removeDismiss(); popup.remove(); window.removeEventListener('keydown', escape); };
  }, [map, quake]);
  if (!host || !quake) return null;
  return createPortal(<section className="quake-popup-card" role="dialog" aria-label={en ? 'Earthquake details' : 'Detail gempa'} translate="no">
    <header className="quake-popup-heading">
    <h3>M{quake.magnitude.toFixed(1)} {en ? 'EARTHQUAKE' : 'GEMPA BUMI'}</h3>
    <button className="quake-popup-close" aria-label={en ? 'Close earthquake details' : 'Tutup detail gempa'} onClick={() => useEarthquakes.setState({ selected: null })}><X size={12} /></button>
    </header>
    <div className="quake-popup-body">
    <p className="quake-popup-place">{quake.place}</p>
    <time>{quakeTime(quake.time, en)}</time>
    <dl><div><dt>{en ? 'DEPTH' : 'KEDALAMAN'}</dt><dd>{quake.depth} km</dd></div><div><dt>{en ? 'COORDS' : 'KOORDINAT'}</dt><dd>{quake.lat.toFixed(3)}, {quake.lng.toFixed(3)}</dd></div></dl>
    {quake.potential && <p className="quake-popup-potential">{quake.potential}</p>}
    </div>
    <footer className="quake-popup-footer"><a href={quake.url} target="_blank" rel="noreferrer"><ExternalLink size={12} />{quake.source} {en ? 'DETAILS' : 'SUMBER'}</a></footer>
  </section>, host);
}
