import publicCameras from './data/bandungPublicCameras.json';
import bandung from './data/bandungCameras.json';
import { create } from 'zustand';
export interface SurveillanceSource {
  id: string;
  name: string;
  kind: 'camera' | 'news';
  url: string;
  previewUrl: string;
  latitude: number;
  longitude: number;
  streamUrl?: string;
  locationName?: string;
  provider?: string;
  discoveryUrl?: string;
}
export const bandungCameras = [
  ...bandung.cameras,
  ...publicCameras.cameras,
] as SurveillanceSource[];
export function hasCameraFeed(source: SurveillanceSource) {
  return Boolean(
    (source.streamUrl && validSurveillanceUrl(source.streamUrl)) ||
    (source.previewUrl && validSurveillanceUrl(source.previewUrl)),
  );
}
export const bandungFeedCameras = bandungCameras.filter(hasCameraFeed);
export const bandungAtcsCount = bandung.cameras.length;
export const bandungPelindungCount = publicCameras.cameras.filter(
  (c) => c.provider === 'PELINDUNG BANDUNG',
).length;
export const pelindungSource = 'https://pelindung.bandung.go.id/';
export type CameraHealth = {
  status: 'online' | 'offline' | 'unknown';
  checkedAt: number;
  reason: string;
};
export function reportCameraHealth(id: string, status: CameraHealth['status'], reason: string) {
  useSurveillance.setState((s) => ({
    health: { ...s.health, [id]: { status, checkedAt: Date.now(), reason } },
  }));
}
export function cameraHealth(id: string): CameraHealth {
  const health = useSurveillance.getState().health[id];
  return health && Date.now() - health.checkedAt < 300000
    ? health
    : { status: 'unknown', checkedAt: 0, reason: 'Belum terverifikasi' };
}
export const bandungSource = bandung.source;
export const bandungRetrievedAt = bandung.retrievedAt;
function loadBandung() {
  try {
    return localStorage.getItem('osint-surveillance-bandung-v1') !== 'false';
  } catch {
    return true;
  }
}
export function setBandung(enabled: boolean) {
  localStorage.setItem('osint-surveillance-bandung-v1', String(enabled));
  useSurveillance.setState({ bandung: enabled });
}
const key = 'osint-surveillance-config-v1';
export function validSurveillanceUrl(value: string) {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
  } catch {
    return false;
  }
}
export function validSource(s: SurveillanceSource) {
  return (
    !!s &&
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    s.name.trim().length > 0 &&
    ['camera', 'news'].includes(s.kind) &&
    validSurveillanceUrl(s.url) &&
    typeof s.previewUrl === 'string' &&
    (!s.previewUrl || validSurveillanceUrl(s.previewUrl)) &&
    (!s.streamUrl || validSurveillanceUrl(s.streamUrl)) &&
    Number.isFinite(s.latitude) &&
    Math.abs(s.latitude) <= 85 &&
    Number.isFinite(s.longitude) &&
    Math.abs(s.longitude) <= 180
  );
}
function load(): SurveillanceSource[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? raw.filter(validSource).slice(0, 200) : [];
  } catch {
    return [];
  }
}
const switchesKey = 'osint-surveillance-switches-v1';
function loadSwitches() {
  const defaults = { cameras: true, previews: true, news: false, showOffline: true };
  try {
    const saved = JSON.parse(localStorage.getItem(switchesKey) || '{}');
    for (const key of ['cameras', 'previews', 'news', 'showOffline'] as const) {
      if (typeof saved?.[key] === 'boolean') defaults[key] = saved[key];
    }
  } catch {}
  return defaults;
}
export const useSurveillance = create<{
  sources: SurveillanceSource[];
  health: Record<string, CameraHealth>;
  bandung: boolean;
  cameras: boolean;
  previews: boolean;
  news: boolean;
  showOffline: boolean;
}>(() => ({ sources: load(), health: {}, bandung: loadBandung(), ...loadSwitches() }));
export function saveSurveillance(sources: SurveillanceSource[]) {
  if (sources.length > 200 || sources.some((s) => !validSource(s)))
    throw new Error('Periksa nama, URL HTTP(S), dan koordinat sumber.');
  localStorage.setItem(key, JSON.stringify(sources));
  useSurveillance.setState({ sources });
}

useSurveillance.subscribe((state, previous) => {
  if (
    state.cameras === previous.cameras &&
    state.previews === previous.previews &&
    state.news === previous.news &&
    state.showOffline === previous.showOffline
  )
    return;
  try {
    localStorage.setItem(
      switchesKey,
      JSON.stringify({
        cameras: state.cameras,
        previews: state.previews,
        news: state.news,
        showOffline: state.showOffline,
      }),
    );
  } catch {
    /* Keep controls usable when storage is unavailable. */
  }
});

export function cameraAvailability(source: SurveillanceSource): CameraHealth {
  return source.kind === 'camera' && !hasCameraFeed(source)
    ? { status: 'unknown', checkedAt: 0, reason: 'URL stream belum terverifikasi' }
    : cameraHealth(source.id);
}
