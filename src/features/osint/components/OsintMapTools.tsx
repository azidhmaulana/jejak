import { selectCamera } from './CameraDock';
import { useWorkspace } from '../workspaceStore';
import MapTools, { type MapSearchResult } from '../../../modules/drawing/MapTools';
import { useActiveBundledCameras } from '../../surveillance/cameraSourceState';
import { cameraAvailability, useSurveillance } from '../../surveillance/osintSurveillanceStore';

export default function OsintMapTools() {
  const objectsOpen = useWorkspace((state) => state.panel === 'objects');
  const bandungCameras = useActiveBundledCameras();
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
        selectCamera(source);
      },
    }));
  return <MapTools visible={!objectsOpen} searchItems={searchItems} />;
}
