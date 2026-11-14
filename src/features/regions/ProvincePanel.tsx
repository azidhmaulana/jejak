import RegionEventList from './RegionEventList';
import { useEarthquakes, visibleEarthquakes } from '../earthquakes/earthquakeStore';
import { useHotspots, visibleHotspots } from '../hotspots/hotspotStore';
import { useEffect, useMemo, useState } from 'react';
import { Camera, MapPinned, Signal, WifiOff, X, Activity, Flame, Info } from 'lucide-react';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { useCameraCatalog } from '../osint/hooks/useCameraCatalog';
import { useWorkspace } from '../osint/workspaceStore';
import { useRoute } from '../routes/routeStore';
import { cameraAvailability, useSurveillance } from '../surveillance/osintSurveillanceStore';
import { cameraProvince, pointProvince, loadProvinces, useRegion } from './regionStore';
import './ProvincePanel.css';
export default function ProvincePanel() {
  const en = useLanguage() === 'en',
    tx = (id: string, english: string) => (en ? english : id);
  const { provinces, selected, showBoundary, loading, error } = useRegion();
  const cameras = useCameraCatalog(true);
  const selectedCamera = useWorkspace((s) => s.selectedId);
  const [eventList, setEventList] = useState<
    'cameras' | 'online' | 'offline' | 'earthquakes' | 'hotspots' | null
  >(null);
  const earthquakes = useEarthquakes(),
    hotspots = useHotspots();
  const allRegion = { ...useRegion.getState(), selected: '' };
  const quakeItems = visibleEarthquakes(earthquakes, allRegion);
  const hotspotItems = visibleHotspots({ ...hotspots, enabled: true }, allRegion);
  const eventCounts = new Map<string, { quakes: number; hotspots: number }>();
  for (const [items, kind] of [
    [quakeItems, 'quakes'],
    [hotspotItems, 'hotspots'],
  ] as const) {
    for (const item of items) {
      const name = pointProvince(item, provinces);
      const count = eventCounts.get(name) || { quakes: 0, hotspots: 0 };
      count[kind]++;
      eventCounts.set(name, count);
    }
  }
  const quakeCount = selected ? eventCounts.get(selected)?.quakes || 0 : quakeItems.length;
  const hotspotCount = selected ? eventCounts.get(selected)?.hotspots || 0 : hotspotItems.length;
  const countLabel = (cctv: number, quakes: number, fires: number) =>
    `CCTV ${cctv.toLocaleString(en ? 'en-US' : 'id-ID')} | ${tx('Gempa', 'Earthquakes')} ${quakes.toLocaleString(en ? 'en-US' : 'id-ID')} | ${tx('Titik api', 'Hotspots')} ${fires.toLocaleString(en ? 'en-US' : 'id-ID')}`;

  const quakePeriod =
    earthquakes.mode === 'latest'
      ? tx('Gempa terbaru', 'Latest earthquake')
      : earthquakes.mode === 'history'
        ? earthquakes.start
          ? `${earthquakes.start} - ${earthquakes.end} (WIB)`
          : tx('Riwayat belum dimuat', 'History not loaded')
        : tx('48 jam terakhir', 'Last 48 hours');
  const hotspotDay = hotspots.days[hotspots.frame];
  const hotspotPeriod =
    hotspots.mode === 'history'
      ? hotspotDay
        ? `${hotspots.cumulative ? `${hotspots.days[0]} - ` : ''}${hotspotDay} (UTC)`
        : tx('Riwayat belum dimuat', 'History not loaded')
      : tx(`${hotspots.loadedHours} jam terakhir`, `Last ${hotspots.loadedHours} hours`);

  useSurveillance();
  const [, refreshHealth] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => refreshHealth((v) => v + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    void loadProvinces();
  }, []);
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const c of cameras) {
      const name = cameraProvince(c, provinces);
      result.set(name, (result.get(name) || 0) + 1);
    }
    return result;
  }, [cameras, provinces]);
  const scoped = useMemo(
    () => cameras.filter((c) => !selected || cameraProvince(c, provinces) === selected),
    [cameras, selected, provinces],
  );
  const online = scoped.filter((c) => cameraAvailability(c).status === 'online').length;
  const offline = scoped.filter((c) => cameraAvailability(c).status === 'offline').length;
  const isCameraList = eventList === 'cameras' || eventList === 'online' || eventList === 'offline';
  const listedCameras = scoped.filter((camera) =>
    eventList === 'online' || eventList === 'offline'
      ? cameraAvailability(camera).status === eventList
      : true,
  );
  const choose = (value: string) => {
    useRegion.setState({ selected: value });
    useWorkspace.setState({ selectedId: null, query: '', cameraTab: 'all' });
    useRoute.setState({ filter: false });
    useEarthquakes.setState({ selected: null });
    useHotspots.setState({ selected: null });
  };
  return (
    <aside
      className={`public-analytics province-panel${eventList ? ' has-region-list' : ''}`}
      aria-label={tx('Wilayah', 'Regions')}
      translate="no"
    >
      <header className="public-analytics-heading">
        <MapPinned size={19} />
        <h2>{tx('Wilayah', 'Regions')}</h2>
        <button
          className="analytics-close"
          aria-label={tx('Tutup wilayah', 'Close regions')}
          onClick={() => useWorkspace.setState({ panel: null })}
        >
          <X size={12} />
        </button>
      </header>
      <div className="public-analytics-body">
        <div className="province-picker">
          <label htmlFor="region-province-select">{tx('Provinsi', 'Province')}</label>
          <div className={`province-select-control${selected ? ' has-selection' : ''}`}>
            <select
              id="region-province-select"
              disabled={loading || error}
              aria-label={tx('Provinsi', 'Province')}
              value={selected}
              onChange={(e) => choose(e.target.value)}
            >
              <option value="">
                {tx('Semua provinsi', 'All provinces')} -{' '}
                {countLabel(cameras.length, quakeItems.length, hotspotItems.length)}
              </option>
              {provinces.map((p) => (
                <option key={p.properties.PROVINSI} value={p.properties.PROVINSI}>
                  {p.properties.PROVINSI} -{' '}
                  {countLabel(
                    counts.get(p.properties.PROVINSI) || 0,
                    eventCounts.get(p.properties.PROVINSI)?.quakes || 0,
                    eventCounts.get(p.properties.PROVINSI)?.hotspots || 0,
                  )}
                </option>
              ))}
            </select>
            {selected && (
              <button
                type="button"
                className="province-select-clear"
                aria-label={tx('Kembali ke semua provinsi', 'Reset to all provinces')}
                title={tx('Semua provinsi', 'All provinces')}
                onClick={() => choose('')}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        {loading && (
          <p role="status">{tx('Memuat batas provinsi...', 'Loading province boundaries...')}</p>
        )}
        {error && (
          <p role="alert">
            {tx('Batas provinsi gagal dimuat.', 'Unable to load boundaries.')}{' '}
            <button className="province-action" onClick={() => void loadProvinces()}>
              {tx('Coba lagi', 'Retry')}
            </button>
          </p>
        )}
        <div className="public-analytics-metrics">
          {[
            {
              Icon: Camera,
              count: scoped.length,
              label: tx('Kamera', 'Cameras'),
              state: '',
              list: 'cameras' as const,
              action: tx('Lihat kamera', 'View cameras'),
            },
            {
              Icon: Signal,
              count: online,
              label: tx('Kamera online', 'Camera online'),
              state: 'online',
              list: 'online' as const,
              action: tx('Lihat kamera online', 'View online cameras'),
            },
            {
              Icon: WifiOff,
              count: offline,
              label: tx('Kamera offline', 'Camera offline'),
              state: 'offline',
              list: 'offline' as const,
              action: tx('Lihat kamera offline', 'View offline cameras'),
            },
            {
              Icon: Activity,
              count: quakeCount,
              label: tx('Gempa', 'Earthquakes'),
              state: 'earthquakes',
              list: 'earthquakes' as const,
              action: tx('Lihat gempa', 'View earthquakes'),
            },
            {
              Icon: Flame,
              count: hotspotCount,
              label: tx('Titik api', 'Hotspots'),
              state: 'hotspots',
              list: 'hotspots' as const,
              action: tx('Lihat hotspot', 'View hotspots'),
            },
          ].map(({ Icon, count, label, state, list, action }) => {
            const content = (
              <>
                <Icon size={16} />
                <span>
                  <b>{count.toLocaleString(en ? 'en-US' : 'id-ID')}</b>
                  <small>{label}</small>
                </span>
              </>
            );
            return (
              <div key={label} className={`${state}${list ? ' province-count-action' : ''}`}>
                {list ? (
                  <button
                    type="button"
                    aria-label={action}
                    aria-expanded={eventList === list}
                    onClick={() => {
                      if (list === 'cameras' || list === 'online' || list === 'offline')
                        useWorkspace.setState({ camerasOpen: false });
                      setEventList((value) => (value === list ? null : list));
                    }}
                  >
                    {content}
                  </button>
                ) : (
                  content
                )}
              </div>
            );
          })}
        </div>
        <div className="province-periods">
          <span>
            {tx('Belum terverifikasi', 'Unverified')}: {scoped.length - online - offline}
          </span>
          <span>
            {tx('Gempa', 'Earthquakes')}: {quakePeriod}
          </span>
          <span>
            {tx('Titik api', 'Hotspots')}: {hotspotPeriod}
            {!hotspots.loaded && !hotspots.loading && !hotspotItems.length
              ? ` - ${tx('belum dimuat', 'not loaded')}`
              : ''}
          </span>
        </div>
        {(earthquakes.loading || hotspots.loading) && (
          <p role="status">
            {tx(
              'Data gempa/titik api masih dimuat; jumlah dapat bertambah.',
              'Earthquake/hotspot data is loading; counts may increase.',
            )}
          </p>
        )}
        <label className="province-boundary">
          <input
            type="checkbox"
            checked={showBoundary}
            onChange={(e) => useRegion.setState({ showBoundary: e.target.checked })}
          />
          {selected
            ? tx('Tampilkan batas provinsi', 'Show province boundary')
            : tx('Tampilkan batas Indonesia', 'Show Indonesia boundary')}
        </label>
        {!scoped.length && selected && (
          <p>{tx('Belum ada kamera pada provinsi ini.', 'No cameras in this province yet.')}</p>
        )}
        {eventList && (
          <RegionEventList
            sortLabel={
              eventList === 'earthquakes'
                ? tx('Urutkan magnitudo', 'Sort by magnitude')
                : eventList === 'hotspots'
                  ? tx('Urutkan tingkat kepercayaan', 'Sort by confidence')
                  : undefined
            }
            key={`${eventList}:${selected}:${earthquakes.mode}:${earthquakes.start}:${hotspots.mode}:${hotspotDay}`}
            title={
              eventList === 'online'
                ? tx('Daftar kamera online', 'Online camera list')
                : eventList === 'offline'
                  ? tx('Daftar kamera offline', 'Offline camera list')
                  : eventList === 'cameras'
                    ? tx('Daftar kamera', 'Camera list')
                    : eventList === 'earthquakes'
                      ? tx('Daftar gempa', 'Earthquake list')
                      : tx('Daftar hotspot', 'Hotspot list')
            }
            loading={
              isCameraList
                ? false
                : eventList === 'earthquakes'
                  ? earthquakes.loading
                  : hotspots.loading
            }
            onClose={() => setEventList(null)}
            selectedId={
              isCameraList
                ? selectedCamera
                : eventList === 'earthquakes'
                  ? earthquakes.selected?.id || null
                  : hotspots.selected?.id || null
            }
            onSelect={(id) => {
              if (isCameraList) {
                useWorkspace.getState().selectCamera(id);
              } else if (eventList === 'earthquakes') {
                const item = quakeItems.find((item) => item.id === id);
                if (item) useEarthquakes.setState({ selected: item, enabled: true });
              } else {
                const item = hotspotItems.find((item) => item.id === id);
                if (item) useHotspots.setState({ selected: item, enabled: true, playing: false });
              }
            }}
            rows={
              isCameraList
                ? listedCameras.map((item) => {
                    const status = cameraAvailability(item).status;
                    return {
                      id: item.id,
                      title: item.name,
                      detail: `${item.provider || item.locationName || 'CCTV'} | ${status}`,
                      color:
                        status === 'online'
                          ? '#39e67c'
                          : status === 'offline'
                            ? '#ff5252'
                            : '#86a9af',
                    };
                  })
                : eventList === 'earthquakes'
                  ? quakeItems
                      .filter((item) => !selected || pointProvince(item, provinces) === selected)
                      .sort((a, b) => b.time - a.time)
                      .map((item) => ({
                        id: item.id,
                        title: `M${item.magnitude.toFixed(1)} - ${item.place}`,
                        rank: item.magnitude,
                        time: item.time,
                        detail: `${item.source} | ${item.depth} km`,
                        color: '#ff5252',
                      }))
                  : hotspotItems
                      .filter((item) => !selected || pointProvince(item, provinces) === selected)
                      .sort((a, b) => b.time - a.time)
                      .map((item) => ({
                        id: item.id,
                        title: item.place || `${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`,
                        time: item.time,
                        detail: item.satellite,
                        rank:
                          item.confidence === 'unknown'
                            ? undefined
                            : { high: 3, medium: 2, low: 1 }[item.confidence],
                        color: {
                          high: '#ff5252',
                          medium: '#ffad42',
                          low: '#ffdf78',
                          unknown: '#aaaaaa',
                        }[item.confidence],
                      }))
            }
          />
        )}
        <div className="province-compact-notes">
          <Info size={12} />
          <span
            title={tx(
              'Filter tetap aktif saat ditutup. Penentuan provinsi mengikuti koordinat.',
              'Filters stay active when closed. Province assignment uses coordinates.',
            )}
          >
            {tx('Filter wilayah aktif', 'Region filter active')}
            {!selected && !loading
              ? ` | ${tx('CCTV tanpa provinsi', 'CCTV province unknown')}: ${counts.get('') || 0}`
              : ''}
          </span>
          <a
            href="https://github.com/mashadinoor/Indonesia-Geojson-2026"
            target="_blank"
            rel="noreferrer"
          >
            GeoJSON
          </a>
          <a href="/data/indonesia-provinces-LICENSE.txt" target="_blank" rel="noreferrer">
            MIT
          </a>
        </div>
      </div>
    </aside>
  );
}
