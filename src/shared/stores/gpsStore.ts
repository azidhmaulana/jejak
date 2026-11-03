import { mapStorageKey, isOsintMap } from '../../modules/maps/mapWorkspace';
import { create } from 'zustand';
import {
  readGpsPreferences,
  validPosition,
  type GpsPosition,
  type GpsPreferences,
} from '../../modules/maps/gpsNavigation';

const key = mapStorageKey('bms-gps-navigation-v1');
const preferences = () => {
  try {
    return readGpsPreferences(localStorage.getItem(key));
  } catch {
    return readGpsPreferences(null);
  }
};
export function cameraGpsPosition(
  state: Pick<GpsState, 'vehicleEnabled' | 'mode' | 'manual' | 'automatic'>,
) {
  const position = state.mode === 'manual' ? state.manual : state.automatic;
  return state.vehicleEnabled && validPosition(position)
    ? { latitude: position.latitude, longitude: position.longitude }
    : null;
}
interface GpsState extends GpsPreferences {
  vehicleEnabled: boolean;
  cueingEnabled: boolean;
  automatic: GpsPosition | null;
  automaticHeading: number | null;
  automaticSimulated: boolean;
  automaticMessage: string;
  focusRevision: number;
  setMode: (mode: GpsPreferences['mode']) => void;
  setOrientation: (orientation: GpsPreferences['orientation']) => void;
  applyManual: (position: GpsPosition) => void;
  focus: () => void;
}
export const useGpsStore = create<GpsState>((set) => ({
  vehicleEnabled: !isOsintMap,
  cueingEnabled: !isOsintMap,
  ...preferences(),
  automatic: null,
  automaticHeading: null,
  automaticSimulated: false,
  automaticMessage: 'Menunggu data GPS otomatis.',
  focusRevision: 0,
  setMode: (mode) => set((state) => ({ mode, focusRevision: state.focusRevision + 1 })),
  setOrientation: (orientation) => set({ orientation }),
  applyManual: (manual) => set((state) => ({ manual, focusRevision: state.focusRevision + 1 })),
  focus: () => set((state) => ({ focusRevision: state.focusRevision + 1 })),
}));
useGpsStore.subscribe((state, previous) => {
  if (
    state.mode === previous.mode &&
    state.orientation === previous.orientation &&
    state.manual === previous.manual
  )
    return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ mode: state.mode, orientation: state.orientation, manual: state.manual }),
    );
  } catch {
    /* Navigation remains available without browser storage. */
  }
});
