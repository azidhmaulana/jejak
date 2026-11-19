import { useHimawari } from './himawariStore';
import { create } from 'zustand';
import { useOsintWeather } from './osintWeatherStore';
import type { ScalarField, ScalarGrid } from './scalarWeather';
interface State {
  loading: boolean;
  error: boolean;
  hour: number;
  opacity: number;
  grid: ScalarGrid | null;
  surfaceDate: string;
  sample: { lng: number; lat: number; value: number | null } | null;
  retry: number;
}
export const useScalarWeather = create<State>(() => ({
  loading: false,
  error: false,
  hour: 0,
  opacity: useOsintWeather.getState().scalarField === 'temperature' ? 0.95 : 0.75,
  grid: null,
  surfaceDate: '',
  sample: null,
  retry: 0,
}));
export function selectScalar(field: ScalarField) {
  useHimawari.setState({ playing: false });
  useScalarWeather.setState({
    sample: null,
    error: false,
    grid: null,
    surfaceDate: '',
    opacity: field === 'temperature' ? 0.95 : 0.75,
  });
  useOsintWeather.setState({
    scalarField: field,
    clouds: false,
    rain: false,
    wind: field === 'gust' || field === 'pressure' || field === 'temperature',
    windHour: useScalarWeather.getState().hour,
    windTime: true,
    playing: false,
  });
}
