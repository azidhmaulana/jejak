import { useLanguage } from '../../../shared/i18n/useLanguage';
import { useCameraCatalog } from '../hooks/useCameraCatalog';
import { cameraAvailability, useSurveillance } from '../../surveillance/osintSurveillanceStore';

export default function WorkspaceTicker() {
  const language = useLanguage();
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
      <span className="ticker-label">INFO</span>
      <div className="ticker-window">
        <div className="ticker-track">
          <span>{text}</span>
          <span aria-hidden="true">{text}</span>
        </div>
      </div>
    </div>
  );
}
