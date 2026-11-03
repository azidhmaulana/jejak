import { useWorkspace } from '../workspaceStore';

/** Hosts the map's real scale, orientation and provider-aware type selector. */
export default function MapCorner() {
  const coordinates = useWorkspace((state) => state.coordinates);
  return (
    <section className="map-corner" aria-label="Map position and style">
      <div className="map-corner-top">
        <div id="map-corner-scale" />
        <div id="map-corner-compass" />
      </div>
      <div className="map-corner-bottom">
        <output aria-label="Map center coordinates">
          {coordinates[1].toFixed(4)}, {coordinates[0].toFixed(4)}
        </output>
        <div id="map-corner-type" />
      </div>
    </section>
  );
}
