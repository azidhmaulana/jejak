export type WindGrid = {
  nx: number;
  ny: number;
  lon0: number;
  lat0: number;
  dx: number;
  dy: number;
  u: number[];
  v: number[];
  validTime: number;
  referenceTime: number;
};
export function validWindGrid(grid: WindGrid): boolean {
  return (
    grid?.nx === 360 &&
    grid.ny === 181 &&
    grid.dx === 1 &&
    grid.dy === 1 &&
    grid.lon0 === 0 &&
    grid.lat0 === 90 &&
    Number.isFinite(grid.validTime) &&
    Number.isFinite(grid.referenceTime) &&
    [grid.u, grid.v].every(
      (a) =>
        Array.isArray(a) &&
        a.length === 65160 &&
        a.every((v) => Number.isFinite(v) && Math.abs(v) <= 200),
    )
  );
}
export function interpolateWind(
  grid: WindGrid,
  longitude: number,
  latitude: number,
): [number, number] | null {
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    latitude > grid.lat0 ||
    latitude < grid.lat0 - (grid.ny - 1) * grid.dy
  )
    return null;
  const x = ((((longitude - grid.lon0) % 360) + 360) % 360) / grid.dx;
  const y = (grid.lat0 - latitude) / grid.dy;
  const x0 = Math.floor(x) % grid.nx,
    x1 = (x0 + 1) % grid.nx;
  const y0 = Math.min(grid.ny - 2, Math.floor(y)),
    y1 = y0 + 1;
  const a = x - Math.floor(x),
    b = y - y0;
  const interpolate = (values: number[]) =>
    values[y0 * grid.nx + x0] * (1 - a) * (1 - b) +
    values[y0 * grid.nx + x1] * a * (1 - b) +
    values[y1 * grid.nx + x0] * (1 - a) * b +
    values[y1 * grid.nx + x1] * a * b;
  return [interpolate(grid.u), interpolate(grid.v)];
}
