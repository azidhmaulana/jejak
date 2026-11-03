import MapTools, { type MapSearchResult } from '../../../modules/drawing/MapTools';
import {
  bandungCameras,
  cameraAvailability,
  useSurveillance,
} from '../../surveillance/osintSurveillanceStore';

export default function OsintMapTools() {
  const surveillance = useSurveillance();
  const searchItems: MapSearchResult[] = [
    ...(surveillance.bandung ? bandungCameras : []),
    ...surveillance.sources,
  ]
    .filter((source) => source.kind === 'camera')
    .map((source) => ({
      id: `camera-${source.id}`,
      title: source.name,
      detail: `CCTV | ${source.provider || source.locationName || 'Sumber kamera'} | ${cameraAvailability(source).status.toUpperCase()}`,
      longitude: source.longitude,
      latitude: source.latitude,
      onSelect() {
        useSurveillance.setState({ cameras: true });
        window.dispatchEvent(new CustomEvent('osint-select-camera', { detail: { id: source.id } }));
      },
    }));
  return <MapTools visible searchItems={searchItems} />;
}
