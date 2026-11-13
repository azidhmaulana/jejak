import type { Drawing } from '../../modules/drawing/mapToolsStore';
import { distanceMeters } from '../../modules/drawing/mapMeasurements';

export function drawingSummary(features: Drawing[]) {
  let area = 0, perimeter = 0;
  for (const feature of features) {
    if (feature.geometry.type !== 'Polygon') continue;
    feature.geometry.coordinates.forEach((ring, index) => {
      let sum = 0;
      for (let i = 1; i < ring.length; i++) {
        const [lng, lat] = ring[i], [prevLng, prevLat] = ring[i - 1];
        const delta = ((lng - prevLng + 540) % 360 - 180) * Math.PI / 180;
        sum += delta * (2 + Math.sin(prevLat * Math.PI / 180) + Math.sin(lat * Math.PI / 180));
        perimeter += distanceMeters(ring[i - 1], ring[i]);
      }
      area += (index === 0 ? 1 : -1) * Math.abs(sum * 6371000 ** 2 / 2);
    });
  }
  return { area: Math.max(0, area) / 1e6, perimeter: perimeter / 1000 };
}
