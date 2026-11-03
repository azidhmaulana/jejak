export type GpsMode = 'automatic' | 'manual';
export type MapOrientation = 'north-up' | 'head-up';
export const MAP_SCALE_MAX_WIDTH = 80;
export const GPS_CENTER_SCALE_METERS = 5000;
export function gpsCenterZoom(latitude: number) {
  const lat = Math.max(-85.051129, Math.min(85.051129, latitude));
  // Place the 5 km ruler at 80% of its maximum width, away from rounding
  // boundaries in MapLibre's metric ScaleControl. Mercator tiles are 512px.
  const circumference = 2 * Math.PI * 6371008.8 * Math.cos((lat * Math.PI) / 180);
  return Math.log2((circumference * MAP_SCALE_MAX_WIDTH * 0.8) / (512 * GPS_CENTER_SCALE_METERS));
}
export interface GpsPosition {
  latitude: number;
  longitude: number;
  heading: number | null;
}
export interface GpsPreferences {
  mode: GpsMode;
  orientation: MapOrientation;
  manual: GpsPosition | null;
}
export const normalizeHeading = (heading: number) => ((heading % 360) + 360) % 360;
export function validPosition(position: unknown): position is GpsPosition {
  if (!position || typeof position !== 'object') return false;
  const { latitude, longitude, heading } = position as GpsPosition;
  return (
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180 &&
    (heading === null || (Number.isFinite(heading) && heading >= 0 && heading <= 360))
  );
}
export function readGpsPreferences(raw: string | null): GpsPreferences {
  const fallback: GpsPreferences = { mode: 'automatic', orientation: 'north-up', manual: null };
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || typeof value !== 'object') return fallback;
    return {
      mode: value.mode === 'manual' ? 'manual' : 'automatic',
      orientation: value.orientation === 'head-up' ? 'head-up' : 'north-up',
      manual:
        validPosition(value.manual) && value.manual.heading !== null
          ? {
              latitude: value.manual.latitude,
              longitude: value.manual.longitude,
              heading: normalizeHeading(value.manual.heading),
            }
          : null,
    };
  } catch {
    return fallback;
  }
}
export function parseManualPosition(fields: {
  latitude: string;
  longitude: string;
  heading: string;
}): GpsPosition | null {
  if (Object.values(fields).some((value) => !value.trim())) return null;
  const position = {
    latitude: Number(fields.latitude),
    longitude: Number(fields.longitude),
    heading: Number(fields.heading),
  };
  return validPosition(position)
    ? { ...position, heading: normalizeHeading(position.heading) }
    : null;
}
export function orientationBearing(
  orientation: MapOrientation,
  position: Pick<GpsPosition, 'heading'> | null,
) {
  return orientation === 'head-up' && position?.heading !== null && position?.heading !== undefined
    ? normalizeHeading(position.heading)
    : 0;
}

export const GPS_MAX_AGE_MS = 30_000;
type GpsSensor = {
  sensor_id: string;
  type: string;
  status: string;
  latitude?: number;
  longitude?: number;
  heading?: number;
  last_seen?: string;
};
export function automaticGps(sensors: GpsSensor[], now = Date.now()): GpsPosition | null {
  const time = (value?: string) =>
    value ? Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : value + 'Z') : NaN;
  const source = sensors
    .filter((sensor) => {
      const age = now - time(sensor.last_seen);
      return (
        sensor.type.toUpperCase() === 'GPS' &&
        sensor.status.toUpperCase() === 'ONLINE' &&
        age >= -5000 &&
        age <= GPS_MAX_AGE_MS &&
        validPosition({ latitude: sensor.latitude, longitude: sensor.longitude, heading: null })
      );
    })
    .sort(
      (a, b) => time(b.last_seen) - time(a.last_seen) || a.sensor_id.localeCompare(b.sensor_id),
    )[0];
  if (!source) return null;
  const heading = source.heading;
  return {
    latitude: source.latitude!,
    longitude: source.longitude!,
    heading:
      typeof heading === 'number' && Number.isFinite(heading) && heading >= 0 && heading <= 360
        ? normalizeHeading(heading)
        : null,
  };
}
