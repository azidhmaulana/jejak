import { create } from 'zustand';
import { readLocalToggle, persistLocalToggle } from '../../shared/stores/localToggle';
type Agency = 'JTWC' | 'NHC' | 'JMA';
type SourceStatus = { agency: Agency; status: 'ok' | 'partial' | 'unavailable'; count: number };
function validSource(source: string) {
  return (
    /^https:\/\/hurricanes\.ral\.ucar\.edu\/repository\/data\/bdecks_open\/\d{4}\/b(?:sh|wp|io|cp)9\d\d{4}\.dat$/.test(source) ||
    /^https:\/\/www\.metoc\.navy\.mil\/jtwc\/products\/(wp|io|sh|ep|cp)\d{4}web\.txt$/.test(
      source,
    ) ||
    /^https:\/\/www\.metoc\.navy\.mil\/jtwc\/products\/ab(?:io|pw)web\.txt$/.test(source) ||
    source === 'https://www.nhc.noaa.gov/CurrentStorms.json' ||
    /^https:\/\/www\.jma\.go\.jp\/bosai\/map\.html#contents=typhoon&typhoon=TC\d{4,20}$/.test(
      source,
    )
  );
}
export type Cyclone = {
  forecast?: {time:number;lat:number;lng:number;windKnots:number|null}[];
  kind?: 'invest';
  potential?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  windRangeKnots?: [number, number] | null;
  agency?: Agency;
  windPeriodMinutes?: number;
  reports?: { agency: Agency; source: string; time: number }[];
  id: string;
  name: string;
  designation: string;
  lat: number;
  lng: number;
  time: number;
  windKnots: number | null;
  gustKnots: number | null;
  direction: number | null;
  speedKnots: number | null;
  source: string;
};
export const useCyclones = create<{
  enabled: boolean;
  items: Cyclone[];
  selected: string | null;
  loading: boolean;
  error: boolean;
  historyStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  historyCount: number;
  feedTime: number | null;
  sources: SourceStatus[];
}>(() => ({
  enabled: readLocalToggle('jejak-cyclones', false),
  items: [],
  selected: null,
  loading: false,
  error: false,
  historyStatus: 'idle',
  historyCount: 0,
  feedTime: null,
  sources: [],
}));
persistLocalToggle(useCyclones, 'enabled', 'jejak-cyclones');
let pending: Promise<void> | null = null;
export function loadCyclones() {
  if (pending) return pending;
  useCyclones.setState({ loading: true, error: false });
  pending = (async () => {
    try {
      const r = await fetch('/api/weather/cyclones', { signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (
        !Array.isArray(data.items) ||
        data.items.length > 120 ||
        !Number.isFinite(data.feedTime) ||
        data.items.some(
          (c: Cyclone) =>
            typeof c.id !== 'string' ||
            typeof c.name !== 'string' ||
            (c.forecast !== undefined && (!Array.isArray(c.forecast) || c.forecast.length > 32 || c.forecast.some(p => !Number.isFinite(p.time) || p.time <= c.time || p.time > c.time + 168 * 3600000 || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat)>90 || Math.abs(p.lng)>180 || (p.windKnots !== null && (!Number.isFinite(p.windKnots) || p.windKnots<0 || p.windKnots>250))))) ||
            (c.kind !== undefined && c.kind !== 'invest') ||
            (c.potential != null && !['LOW', 'MEDIUM', 'HIGH'].includes(c.potential)) ||
            (c.windRangeKnots != null &&
              (!Array.isArray(c.windRangeKnots) ||
                c.windRangeKnots.length !== 2 ||
                c.windRangeKnots.some((n) => !Number.isFinite(n) || n < 0 || n > 250) ||
                c.windRangeKnots[0] > c.windRangeKnots[1])) ||
            !Number.isFinite(c.time) ||
            !Number.isFinite(c.lat) ||
            !Number.isFinite(c.lng) ||
            Math.abs(c.lat) > 90 ||
            Math.abs(c.lng) > 180 ||
            !validSource(c.source) ||
            (c.agency !== undefined && !['JTWC', 'NHC', 'JMA'].includes(c.agency)) ||
            (c.reports !== undefined &&
              (!Array.isArray(c.reports) ||
                c.reports.some(
                  (report) =>
                    !validSource(report.source) || !['JTWC', 'NHC', 'JMA'].includes(report.agency),
                ))),
        )
      )
        throw new Error();
      const sources: SourceStatus[] = Array.isArray(data.sources)
        ? data.sources.filter(
            (source: SourceStatus) =>
              ['JTWC', 'NHC', 'JMA'].includes(source.agency) &&
              ['ok', 'partial', 'unavailable'].includes(source.status) &&
              Number.isFinite(source.count),
          )
        : [];
      useCyclones.setState({ items: data.items, feedTime: data.feedTime, sources });
    } catch {
      useCyclones.setState({ error: true, items: [] });
    } finally {
      useCyclones.setState({ loading: false });
      pending = null;
    }
  })();
  return pending;
}
