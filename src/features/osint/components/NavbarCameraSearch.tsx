import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Search, X } from 'lucide-react';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import { useActiveBundledCameras } from '../../surveillance/cameraSourceState';
import {
  hasSourceCoordinates,
  setBandung,
  useSurveillance,
  type SurveillanceSource,
} from '../../surveillance/osintSurveillanceStore';
import { useRoute } from '../../routes/routeStore';
import { useWorkspace } from '../workspaceStore';
import { selectCamera } from './CameraDock';
import './NavbarCameraSearch.css';

export default function NavbarCameraSearch({ onClose }: { onClose: () => void }) {
  const en = useLanguage() === 'en';
  const bundled = useActiveBundledCameras();
  const custom = useSurveillance((state) => state.sources);
  const query = useWorkspace((state) => state.query);
  const [active, setActive] = useState(-1);
  const [limit, setLimit] = useState(20);
  const root = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return [...bundled, ...custom].filter(
      (camera) =>
        camera.kind === 'camera' &&
        terms.every((term) =>
          `${camera.name} ${camera.provider || ''} ${camera.locationName || ''}`
            .toLowerCase()
            .includes(term),
        ),
    );
  }, [query, bundled, custom]);
  const results = matches.slice(0, limit);
  const activeIndex = active >= 0 && active < results.length ? active : -1;
  useEffect(() => {
    setActive(-1);
    setLimit(20);
  }, [query]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        !root.current?.contains(event.target as Node) &&
        !(event.target as Element).closest?.('[aria-label="Search cameras"]')
      )
        onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [onClose]);
  const choose = (camera: SurveillanceSource) => {
    if (bundled.some((c) => c.id === camera.id)) setBandung(true);
    const route = useRoute.getState();
    if (route.filter && !route.result?.cameras.some((c) => c.id === camera.id))
      useRoute.setState({ filter: false });
    useWorkspace.setState({ camerasOpen: false, cameraTab: 'all' });
    selectCamera(camera, { zoom: 14 });
    onClose();
  };
  return (
    <div ref={root} className="tactical-search navbar-camera-search" data-i18n-skip>
      <div className="navbar-camera-search-field">
        <Search size={16} />
        <input
          autoFocus
          aria-label="Search camera catalog"
          role="combobox"
          autoComplete="off"
          aria-expanded={results.length > 0}
          aria-controls="navbar-camera-results"
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `navbar-camera-result-${activeIndex}` : undefined
          }
          placeholder={
            en ? 'Search cameras, toll roads, places...' : 'Cari kamera, ruas tol, lokasi...'
          }
          value={query}
          onChange={(event) => useWorkspace.setState({ query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              onClose();
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const step = event.key === 'ArrowDown' ? 1 : -1;
              setActive(
                results.length
                  ? activeIndex < 0
                    ? step === 1
                      ? 0
                      : results.length - 1
                    : (activeIndex + step + results.length) % results.length
                  : -1,
              );
            }
            if (event.key === 'Enter' && results.length) {
              event.preventDefault();
              choose(results[Math.max(0, activeIndex)]);
            }
          }}
        />
        <button
          aria-label={en ? 'Close camera search' : 'Tutup pencarian kamera'}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      <small role="status">
        {query.trim()
          ? `${matches.length} ${en ? 'cameras found' : 'kamera ditemukan'}`
          : en
            ? 'Try: BINA MARGA, Cipularang, Pasteur'
            : 'Coba: BINA MARGA, Cipularang, Pasteur'}
      </small>
      <div
        id="navbar-camera-results"
        role="listbox"
        aria-label={en ? 'Camera search results' : 'Hasil pencarian kamera'}
      >
        {results.map((camera, index) => (
          <button
            key={camera.id}
            id={`navbar-camera-result-${index}`}
            role="option"
            aria-selected={activeIndex === index}
            onClick={() => choose(camera)}
          >
            <Camera size={16} />
            <span>
              <strong>{camera.name}</strong>
              <small>{camera.provider}</small>
              {camera.coordinateAccuracy === 'approximate' && (
                <small>
                  {camera.coordinateKind === 'road-reference' ||
                  camera.coordinateKind === 'locality-reference' ||
                  camera.coordinateKind === 'junction-reference'
                    ? en
                      ? 'Area reference - not camera position'
                      : 'Referensi wilayah - bukan posisi kamera'
                    : en
                      ? 'Estimated position'
                      : 'Posisi perkiraan'}
                </small>
              )}
              {!hasSourceCoordinates(camera) && (
                <small>
                  {en
                    ? 'Stream only - location unverified'
                    : 'Stream saja - lokasi belum terverifikasi'}
                </small>
              )}
            </span>
          </button>
        ))}
      </div>
      {matches.length > results.length && (
        <button onClick={() => setLimit((value) => value + 20)}>
          {en ? 'Show more' : 'Tampilkan lagi'} ({results.length}/{matches.length})
        </button>
      )}
    </div>
  );
}
