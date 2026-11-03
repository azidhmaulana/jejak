export type OfflineBounds = [number, number, number, number];
export function offlineSelectionBounds(points: { lng: number; lat: number }[]): OfflineBounds {
  if (
    points.length < 2 ||
    points.some((p) => !Number.isFinite(p.lng) || !Number.isFinite(p.lat) || Math.abs(p.lat) > 85)
  )
    throw Error('Batas wilayah tidak valid.');
  if (Math.max(...points.map((p) => p.lng)) - Math.min(...points.map((p) => p.lng)) > 180)
    throw Error('Area terlalu luas. Perbesar peta atau pilih area lebih kecil.');
  const wrap = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;
  const reference = wrap(points[0].lng);
  const longitude = points.map((p) => reference + wrap(p.lng - reference));
  const bounds: OfflineBounds = [
    Math.min(...longitude),
    Math.min(...points.map((p) => p.lat)),
    Math.max(...longitude),
    Math.max(...points.map((p) => p.lat)),
  ];
  if (bounds[0] < -180 || bounds[2] > 180)
    throw Error('Area melintasi garis tanggal. Pilih area pada satu sisi peta.');
  if (bounds[2] - bounds[0] < 0.00001 || bounds[3] - bounds[1] < 0.00001)
    throw Error('Area terlalu kecil. Pilih dua sudut yang berbeda.');
  if ((bounds[2] - bounds[0]) * (bounds[3] - bounds[1]) > 100)
    throw Error('Area terlalu luas. Perbesar peta atau pilih area lebih kecil.');
  return bounds;
}
