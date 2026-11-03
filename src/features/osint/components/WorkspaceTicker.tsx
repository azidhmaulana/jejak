import { useCameraCatalog } from '../hooks/useCameraCatalog';
import { cameraAvailability, useSurveillance } from '../../surveillance/osintSurveillanceStore';

export default function WorkspaceTicker() {
  const cameras = useCameraCatalog();
  useSurveillance((state) => state.health);
  const online = cameras.filter((camera) => cameraAvailability(camera).status === 'online').length;
  const offline = cameras.filter(
    (camera) => cameraAvailability(camera).status === 'offline',
  ).length;
  const text = `JEJAK � GEOSPATIAL INTELLIGENCE   �   ${cameras.length} kamera terdaftar   �   ${online} online   �   ${offline} offline   �   ${cameras.length - online - offline} belum diverifikasi   �   Pilih titik kamera untuk membuka monitor   �   Gunakan menu layer untuk mengatur tampilan peta`;
  return (
    <div className="workspace-ticker" aria-label="Informasi workspace">
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
