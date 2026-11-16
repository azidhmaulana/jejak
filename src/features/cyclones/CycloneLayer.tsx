import { useEffect } from 'react';
import { Marker, type Map } from 'maplibre-gl';
import { useCyclones, loadCyclones } from './cycloneStore';
import { useWorkspace } from '../osint/workspaceStore';
import './Cyclones.css';
export default function CycloneLayer({ map }: { map: Map | null }) {
  const { enabled, items, selected } = useCyclones();
  useEffect(() => {
    if (!enabled) return;
    void loadCyclones();
    const timer = setInterval(() => {
      if (!document.hidden) void loadCyclones();
    }, 10 * 60000);
    return () => clearInterval(timer);
  }, [enabled]);
  useEffect(() => {
    if (!map || !enabled) return;
    const markers = items
      .filter((c) => Date.now() - c.time <= 36 * 3600000)
      .map((c) => {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'cyclone-marker';
        element.dataset.selected = String(selected === c.id);
        element.setAttribute('aria-label', c.name + ' · ' + c.designation);
        const symbol = document.createElement('span');
        symbol.className = 'cyclone-marker-symbol';
        symbol.textContent = '↻';
        symbol.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = c.name;
        element.append(symbol, label);
        element.onclick = () => {
          useCyclones.setState({ selected: c.id });
          useWorkspace.setState({ panel: 'cyclones' });
        };
        return new Marker({ element }).setLngLat([c.lng, c.lat]).addTo(map);
      });
    return () => markers.forEach((m) => m.remove());
  }, [map, enabled, items, selected]);
  useEffect(() => {
    if (!map) return;
    const focus = (e: Event) => {
      const c = useCyclones.getState().items.find((c) => c.id === (e as CustomEvent).detail);
      if (c) map.flyTo({ center: [c.lng, c.lat], zoom: 5 });
    };
    window.addEventListener('jejak-focus-cyclone', focus);
    return () => window.removeEventListener('jejak-focus-cyclone', focus);
  }, [map]);
  return null;
}
