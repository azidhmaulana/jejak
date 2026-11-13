import { useState } from 'react';
import AboutDialog from '../../../shared/components/AboutDialog';
import { useEarthquakes, quakeTime, setEarthquakeMode } from '../../earthquakes/earthquakeStore';
import { useWorkspace } from '../workspaceStore';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import { useCameraCatalog } from '../hooks/useCameraCatalog';
import { cameraAvailability, useSurveillance } from '../../surveillance/osintSurveillanceStore';

export default function WorkspaceTicker() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const language = useLanguage();
  const quake = useEarthquakes(s => s.latest);
  const liveError = useEarthquakes(s => s.liveError || s.status.bmkgStale || s.status.usgsStale);
  const cameras = useCameraCatalog();
  useSurveillance((state) => state.health);
  const online = cameras.filter((camera) => cameraAvailability(camera).status === 'online').length;
  const offline = cameras.filter(
    (camera) => cameraAvailability(camera).status === 'offline',
  ).length;
  const unverified = cameras.length - online - offline;
  const text = (language === 'en'
    ? ['JEJAK', 'GEOSPATIAL INTELLIGENCE', `${cameras.length} registered cameras`, `${online} online`, `${offline} offline`, `${unverified} unverified`, 'Select a camera marker to open the monitor', 'Use the layer menu to adjust the map']
    : ['JEJAK', 'GEOSPATIAL INTELLIGENCE', `${cameras.length} kamera terdaftar`, `${online} online`, `${offline} offline`, `${unverified} belum diverifikasi`, 'Pilih titik kamera untuk membuka monitor', 'Gunakan menu layer untuk mengatur tampilan peta']
  ).join('   \u2022   ');
  return (
    <div className="workspace-ticker" aria-label={language === 'en' ? 'Workspace information' : 'Informasi workspace'} translate="no">
      <span className="quake-announcement" role="status">{quake ? `${language === 'en' ? 'Latest earthquake' : 'Gempa terbaru'} M${quake.magnitude.toFixed(1)}, ${quake.place}, ${quakeTime(quake.time, language === 'en')}, ${quake.source}` : ''}</span>
      {quake ? <button className="quake-ticker-trigger" data-large={quake.magnitude >= 6} onClick={() => { setEarthquakeMode('latest'); useEarthquakes.setState({ selected: quake, enabled: true }); useWorkspace.setState({ panel: 'earthquakes' }); }}>{language === 'en' ? 'QUAKE' : 'GEMPA'} M{quake.magnitude.toFixed(1)}</button> : <span className="ticker-label">INFO</span>}
      <div className="ticker-window">
        <div className="ticker-track">
          {[0, 1].map(copy => <span key={copy} aria-hidden={copy === 1}>
            {quake && <strong className="quake-ticker" data-large={quake.magnitude >= 6}>{language === 'en' ? 'LATEST QUAKE' : 'GEMPA TERBARU'}: M{quake.magnitude.toFixed(1)} | {quake.place} | {quake.depth} km | {quakeTime(quake.time, language === 'en')} | {quake.source}{liveError ? (language === 'en' ? ' (update delayed)' : ' (pembaruan tertunda)') : ''} ? </strong>}
            {text}
          </span>)}
        </div>
      </div>
      <button className="ticker-version" onClick={() => setAboutOpen(true)} aria-label={language === 'en' ? 'About JEJAK' : 'Tentang JEJAK'}>JEJAK v1.0.0</button>
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
