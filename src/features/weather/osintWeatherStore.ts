import { readLocalToggle, persistLocalToggle } from '../../shared/stores/localToggle';
import { create } from 'zustand';

export type WeatherLayer = 'clouds' | 'wind' | 'rain';
export interface RadarFrame {
  time: number;
  path: string;
}
interface WeatherState {
  clouds: boolean;
  wind: boolean;
  rain: boolean;
  particles: boolean;
  windTime: boolean;
  rainTime: boolean;
  windHour: number;
  rainIndex: number;
  playing: boolean;
  frames: RadarFrame[];
  status: Record<WeatherLayer, string>;
}
export const useOsintWeather = create<WeatherState>(() => ({
  clouds: readLocalToggle('jejak-weather-clouds', false),
  wind: readLocalToggle('jejak-weather-wind', false),
  rain: readLocalToggle('jejak-weather-rain', false),
  particles: readLocalToggle('jejak-weather-particles', true),
  windTime: readLocalToggle('jejak-weather-windTime', false),
  rainTime: readLocalToggle('jejak-weather-rainTime', false),
  windHour: 0,
  rainIndex: -1,
  playing: false,
  frames: [],
  status: { clouds: '', wind: '', rain: '' },
}));
export function weatherStatus(layer: WeatherLayer, value: string) {
  useOsintWeather.setState((s) => ({ status: { ...s.status, [layer]: value } }));
}
export function toggleWeather(layer: WeatherLayer) {
  useOsintWeather.setState((s) => ({
    [layer]: !s[layer],
    ...(layer === 'rain' ? { playing: false } : {}),
  }));
}

persistLocalToggle(useOsintWeather, 'clouds', 'jejak-weather-clouds');

persistLocalToggle(useOsintWeather, 'wind', 'jejak-weather-wind');

persistLocalToggle(useOsintWeather, 'rain', 'jejak-weather-rain');

persistLocalToggle(useOsintWeather, 'particles', 'jejak-weather-particles');

persistLocalToggle(useOsintWeather, 'windTime', 'jejak-weather-windTime');

persistLocalToggle(useOsintWeather, 'rainTime', 'jejak-weather-rainTime');
