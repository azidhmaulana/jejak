import { useMemo } from 'react';
import { bandungCameras, useSurveillance } from '../../surveillance/osintSurveillanceStore';

export function useCameraCatalog() {
  const sources = useSurveillance((state) => state.sources);
  const bandung = useSurveillance((state) => state.bandung);
  return useMemo(
    () =>
      [...(bandung ? bandungCameras : []), ...sources].filter((source) => source.kind === 'camera'),
    [sources, bandung],
  );
}
