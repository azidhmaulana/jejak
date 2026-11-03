import { useRoute } from '../../routes/routeStore';
import { useMemo } from 'react';
import { bandungCameras, useSurveillance } from '../../surveillance/osintSurveillanceStore';

export function useCameraCatalog() {
  const result = useRoute((state) => (state.filter ? state.result : null));
  const sources = useSurveillance((state) => state.sources);
  const bandung = useSurveillance((state) => state.bandung);
  return useMemo(
    () =>
      [...(bandung ? bandungCameras : []), ...sources].filter(
        (source) =>
          source.kind === 'camera' &&
          (!result || result.cameras.some((camera) => camera.id === source.id)),
      ),
    [sources, bandung, result],
  );
}
