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
// Session only: opening a workspace never silently starts external weather feeds.
export const useOsintWeather = create<WeatherState>(() => ({
  clouds: false,
  wind: false,
  rain: false,
  particles: true,
  windTime: false,
  rainTime: false,
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
