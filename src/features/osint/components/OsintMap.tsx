import RouteLayer from '../../routes/RouteLayer';
import MapCanvas from '../../../modules/maps/MapCanvas';
import OsintWeatherLayer from '../../weather/OsintWeatherLayer';
import OsintSurveillanceLayer from '../../surveillance/OsintSurveillanceLayer';
import MapHud from './MapHud';
import { useWorkspace } from '../workspaceStore';
import RoadReferenceLayer from '../../../modules/maps/RoadReferenceLayer';
const roadAvailability = (roadsAvailable: boolean) => useWorkspace.setState({ roadsAvailable });

export default function OsintMap() {
  const selectedId = useWorkspace((state) => state.selectedId);
  const roads = useWorkspace((state) => state.roads);
  return (
    <MapCanvas>
      {(map) => (
        <>
          <OsintWeatherLayer map={map} />
          <RoadReferenceLayer map={map} enabled={roads} onAvailability={roadAvailability} />
          <OsintSurveillanceLayer
            map={map}
            externalPanel
            externalSelectedId={selectedId}
            onSelect={useWorkspace.getState().selectCamera}
          />
          <RouteLayer map={map} />
          <MapHud map={map} />
        </>
      )}
    </MapCanvas>
  );
}
