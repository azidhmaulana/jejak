import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../i18n/useLanguage';

type Point = [number, number];
type Place = { name: string; point: Point };
const cache = new Map<string, Place[]>();
const coordinates = (value: string): Point | null => {
  if (!/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(value)) return null;
  const [lat, lon] = value.split(',').map(Number);
  return Math.abs(lat) <= 85 && Math.abs(lon) <= 180 ? [lon, lat] : null;
};

export default function PlaceSearch({
  label,
  point,
  onChange,
}: {
  label: string;
  point: Point | null;
  onChange: (point: Point | null) => void;
}) {
  const en = useLanguage() === 'en';
  const id = useId();
  const selected = useRef<Point | null | undefined>(undefined);
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [focused, setFocused] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState('');
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (point === selected.current) return;
    selected.current = point;
    setValue(point ? `${point[1].toFixed(6)}, ${point[0].toFixed(6)}` : '');
    setEditing(false);
  }, [point]);
  useEffect(() => {
    setPlaces([]);
    setActive(-1);
    setStatus('');
    if (!editing || !focused || value.trim().length < 3 || coordinates(value)) return;
    const controller = new AbortController();
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setStatus('loading');
      const key = value.trim().toLowerCase();
      try {
        let results = cache.get(key);
        if (!results) {
          const params = new URLSearchParams({ q: value.trim(), limit: '6', bbox: '94,-11,142,6' });
          const response = await fetch(`https://photon.komoot.io/api/?${params}`, {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
          });
          if (!response.ok) throw new Error('Search failed');
          const data = await response.json();
          results = (data.features || []).flatMap((feature: any) => {
            const p = feature.properties || {};
            const point = feature.geometry?.coordinates;
            if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))
              return [];
            const name = [
              ...new Set([p.name, p.street, p.city, p.county, p.state, p.country].filter(Boolean)),
            ].join(', ');
            return name ? [{ name, point }] : [];
          });
          if (cache.size >= 100) cache.clear();
          cache.set(key, results!);
        }
        if (!cancelled) {
          setPlaces(results!);
          setStatus(results!.length ? '' : 'empty');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, editing, focused]);
  const choose = (place: Place) => {
    selected.current = place.point;
    setValue(place.name);
    setEditing(false);
    setPlaces([]);
    onChange(place.point);
  };
  return (
    <div
      className="place-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="place-search-field">
        <input
          id={id}
          role="combobox"
          autoComplete="off"
          value={value}
          maxLength={200}
          placeholder={
            en ? 'Search city, place, or address...' : 'Cari kota, tempat, atau alamat...'
          }
          aria-autocomplete="list"
          aria-expanded={focused && places.length > 0}
          aria-controls={`${id}-results`}
          aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
          onFocus={() => setFocused(true)}
          onChange={(event) => {
            const value = event.target.value;
            setValue(value);
            setEditing(true);
            selected.current = coordinates(value);
            onChange(selected.current);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setFocused(false);
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) =>
                places.length
                  ? (index + (event.key === 'ArrowDown' ? 1 : places.length - 1) + places.length) %
                    places.length
                  : -1,
              );
            }
            if (event.key === 'Enter' && active >= 0 && places[active]) {
              event.preventDefault();
              choose(places[active]);
            }
          }}
        />
        {value && (
          <button
            type="button"
            className="place-search-clear"
            aria-label={`${en ? 'Clear' : 'Hapus'} ${label}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              selected.current = null;
              setValue('');
              setEditing(false);
              setPlaces([]);
              setStatus('');
              setActive(-1);
              onChange(null);
              document.getElementById(id)?.focus();
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {focused && (places.length > 0 || status) && (
        <div className="place-search-dropdown">
          <div id={`${id}-results`} role="listbox" aria-label={label}>
            {places.map((place, index) => (
              <button
                type="button"
                role="option"
                key={`${place.name}-${index}`}
                id={`${id}-${index}`}
                aria-selected={active === index}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(place)}
              >
                {place.name}
              </button>
            ))}
          </div>
          {status && (
            <small role="status">
              {status === 'loading'
                ? en
                  ? 'Searching...'
                  : 'Mencari...'
                : status === 'empty'
                  ? en
                    ? 'No locations found.'
                    : 'Lokasi tidak ditemukan.'
                  : en
                    ? 'Search unavailable. Try again or pick on map.'
                    : 'Pencarian gagal. Coba lagi atau pilih di peta.'}
            </small>
          )}
        </div>
      )}
    </div>
  );
}
