import { matchesProvince, useRegion } from '../../regions/regionStore';
import { useRoute } from '../../routes/routeStore';
import { useMemo } from 'react';
import { useSurveillance } from '../../surveillance/osintSurveillanceStore';
import { useActiveBundledCameras } from '../../surveillance/cameraSourceState';

export function useCameraCatalog(unfiltered = false) {
  const { selected, provinces } = useRegion();
  const bandungCameras = useActiveBundledCameras();
  const result = useRoute((state) => (state.filter ? state.result : null));
  const sources = useSurveillance((state) => state.sources);
  const bandung = useSurveillance((state) => state.bandung);
  return useMemo(
    () =>
      [...(bandung ? bandungCameras : []), ...sources].filter(
        (source) =>
          source.kind === 'camera' &&
          (unfiltered || matchesProvince(source, selected, provinces)) &&
          (unfiltered || !result || result.cameras.some((camera) => camera.id === source.id)),
      ),
    [sources, bandung, result, bandungCameras, selected, provinces, unfiltered],
  );
}
