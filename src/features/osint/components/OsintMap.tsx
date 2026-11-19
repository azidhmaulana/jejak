import ScalarWeatherLayer from '../../weather/ScalarWeatherLayer';
import ScalarWeatherPanel from '../../weather/components/ScalarWeatherPanel';
import WeatherRail from '../../weather/components/WeatherRail';
import WeatherDock from '../../weather/components/WeatherDock';
import CycloneLayer from '../../cyclones/CycloneLayer';
import HimawariLayer from '../../weather/HimawariLayer';
import InfraLegend from '../../weather/components/InfraLegend';
import WindLegend from '../../weather/components/WindLegend';
import WindLayer from '../../weather/WindLayer';
import HotspotLayer from '../../hotspots/HotspotLayer';
import EarthquakeLayer from '../../earthquakes/EarthquakeLayer';
import ProvinceLayer from '../../regions/ProvinceLayer';
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
          <ScalarWeatherLayer map={map} />
          <ScalarWeatherPanel />
          <WindLayer map={map} />
          <CycloneLayer map={map} />
          <WindLegend />
          <InfraLegend />
          <WeatherDock />
          <WeatherRail />
          <HimawariLayer map={map} />
          <RoadReferenceLayer map={map} enabled={roads} onAvailability={roadAvailability} />
          <OsintSurveillanceLayer
            map={map}
            externalPanel
            externalSelectedId={selectedId}
            onSelect={useWorkspace.getState().selectCamera}
          />
          <RouteLayer map={map} />
          <ProvinceLayer map={map} />
          <EarthquakeLayer map={map} />
          <HotspotLayer map={map} />
          <MapHud map={map} />
        </>
      )}
    </MapCanvas>
  );
}
