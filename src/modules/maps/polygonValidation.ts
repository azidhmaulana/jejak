type Point = number[];
const epsilon = 1e-12;
const turn = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (a: Point, b: Point, p: Point) =>
  Math.abs(turn(a, b, p)) < epsilon &&
  p[0] >= Math.min(a[0], b[0]) - epsilon &&
  p[0] <= Math.max(a[0], b[0]) + epsilon &&
  p[1] >= Math.min(a[1], b[1]) - epsilon &&
  p[1] <= Math.max(a[1], b[1]) + epsilon;
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const abC = turn(a, b, c),
    abD = turn(a, b, d),
    cdA = turn(c, d, a),
    cdB = turn(c, d, b);
  return (
    (abC * abD < 0 && cdA * cdB < 0) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}
function inside(point: Point, ring: Point[]) {
  let result = false;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1],
      b = ring[i];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}
/** Validate imported rings without changing their shape; unwrap the date line first. */
export function validatePolygonRings(coordinates: Point[][]) {
  const anchor = coordinates[0][0][0];
  const rings = coordinates.map((ring) =>
    ring.map((p) => [anchor + ((p[0] - anchor + 540) % 360) - 180, p[1]]),
  );
  const segments = rings
    .flatMap((ring, r) => {
      let area = 0;
      const result = ring.slice(1).map((b, i) => {
        const a = ring[i];
        if (a[0] === b[0] && a[1] === b[1])
          throw Error('Polygon memiliki titik berulang pada sisi yang sama.');
        area += a[0] * b[1] - b[0] * a[1];
        return {
          a,
          b,
          r,
          i,
          count: ring.length - 1,
          minX: Math.min(a[0], b[0]),
          maxX: Math.max(a[0], b[0]),
          minY: Math.min(a[1], b[1]),
          maxY: Math.max(a[1], b[1]),
        };
      });
      if (Math.abs(area) < epsilon)
        throw Error('Polygon memiliki luas nol atau garis berpotongan.');
      return result;
    })
    .sort((a, b) => a.minX - b.minX);
  let active: typeof segments = [],
    checks = 0;
  for (const current of segments) {
    active = active.filter((other) => other.maxX >= current.minX);
    for (const other of active) {
      if (++checks > 3_000_000)
        throw Error('Polygon terlalu kompleks. Sederhanakan titik sebelum import.');
      if (other.maxY < current.minY || current.maxY < other.minY) continue;
      if (
        current.r === other.r &&
        (Math.abs(current.i - other.i) === 1 || Math.abs(current.i - other.i) === current.count - 1)
      )
        continue;
      if (intersects(current.a, current.b, other.a, other.b))
        throw Error('Garis polygon atau batas lubang saling berpotongan.');
    }
    active.push(current);
  }
  for (let i = 1; i < rings.length; i++) {
    if (!inside(rings[i][0], rings[0]))
      throw Error('Lubang polygon harus berada di dalam batas luar.');
    for (let j = 1; j < i; j++)
      if (inside(rings[i][0], rings[j]) || inside(rings[j][0], rings[i]))
        throw Error('Lubang polygon saling tumpang tindih.');
  }
}
