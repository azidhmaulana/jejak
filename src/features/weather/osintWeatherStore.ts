import { scalarFields, type ScalarField } from './scalarWeather';
import { readLocalToggle, persistLocalToggle } from '../../shared/stores/localToggle';
import { create } from 'zustand';

export type WeatherLayer = 'clouds' | 'wind' | 'rain';
export interface RadarFrame {
  time: number;
  path: string;
}
interface WeatherState {
  scalarField: ScalarField | null;
  clouds: boolean;
  wind: boolean;
  rain: boolean;
  radarOverlay: boolean;
  radarLoading: boolean;
  windLoading: boolean;
  particles: boolean;
  windTime: boolean;
  rainTime: boolean;
  windHour: number;
  windOpacity: number;
  windValidTime: number | null;
  windReferenceTime: number | null;
  rainIndex: number;
  playing: boolean;
  frames: RadarFrame[];
  status: Record<WeatherLayer, string>;
}
function restoredScalar(): ScalarField | null {
  try {
    const value = localStorage.getItem('jejak-weather-field');
    return value && Object.prototype.hasOwnProperty.call(scalarFields, value)
      ? (value as ScalarField)
      : null;
  } catch {
    return null;
  }
}
const initialScalar = restoredScalar();
export const useOsintWeather = create<WeatherState>(() => ({
  scalarField: initialScalar,
  clouds: !initialScalar && readLocalToggle('jejak-weather-clouds', false),
  wind: initialScalar
    ? ['gust', 'pressure', 'temperature'].includes(initialScalar)
    : !readLocalToggle('jejak-weather-clouds', false) &&
      readLocalToggle('jejak-weather-wind', false),
  rain:
    !initialScalar &&
    !readLocalToggle('jejak-weather-clouds', false) &&
    !readLocalToggle('jejak-weather-wind', false) &&
    readLocalToggle('jejak-weather-rain', false),
  radarLoading: false,
  windLoading: false,
  radarOverlay: readLocalToggle('jejak-weather-radar-overlay', false),
  particles: readLocalToggle('jejak-weather-particles', true),
  windTime: readLocalToggle('jejak-weather-windTime', false),
  rainTime: readLocalToggle('jejak-weather-rainTime', false),
  windHour: 0,
  windOpacity: 0.8,
  windValidTime: null,
  windReferenceTime: null,
  rainIndex: -1,
  playing: false,
  frames: [],
  status: { clouds: '', wind: '', rain: '' },
}));
export function weatherStatus(layer: WeatherLayer, value: string) {
  useOsintWeather.setState((s) => ({ status: { ...s.status, [layer]: value } }));
}
export function selectWeather(layer: WeatherLayer | null) {
  useOsintWeather.setState({
    scalarField: null,
    clouds: layer === 'clouds',
    wind: layer === 'wind',
    rain: layer === 'rain',
    playing: false,
  });
}
export function toggleWeather(layer: WeatherLayer) {
  const current = useOsintWeather.getState();
  if (
    layer === 'wind' &&
    (current.scalarField === 'gust' ||
      current.scalarField === 'pressure' ||
      current.scalarField === 'temperature')
  ) {
    useOsintWeather.setState({ wind: !current.wind });
    return;
  }
  selectWeather(useOsintWeather.getState()[layer] ? null : layer);
}

persistLocalToggle(useOsintWeather, 'clouds', 'jejak-weather-clouds');

persistLocalToggle(useOsintWeather, 'wind', 'jejak-weather-wind');

persistLocalToggle(useOsintWeather, 'rain', 'jejak-weather-rain');

persistLocalToggle(useOsintWeather, 'particles', 'jejak-weather-particles');

persistLocalToggle(useOsintWeather, 'windTime', 'jejak-weather-windTime');

persistLocalToggle(useOsintWeather, 'rainTime', 'jejak-weather-rainTime');

persistLocalToggle(useOsintWeather, 'radarOverlay', 'jejak-weather-radar-overlay');

useOsintWeather.subscribe((state, previous) => {
  if (state.scalarField === previous.scalarField) return;
  try {
    if (state.scalarField) localStorage.setItem('jejak-weather-field', state.scalarField);
    else localStorage.removeItem('jejak-weather-field');
  } catch {
    /* In-memory layer selection remains usable. */
  }
});
