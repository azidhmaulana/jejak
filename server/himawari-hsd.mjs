// JMA Himawari Standard Data v1.3: block lengths and calibration are read from each file.
export function parseHsd(buffer) {
  if (buffer.length < 300 || buffer[0] !== 1 || buffer[5] !== 0)
    throw new Error('Invalid HSD byte order');
  const headerSize = buffer.readUInt32LE(70),
    dataSize = buffer.readUInt32LE(74);
  if (headerSize > 65536 || headerSize + dataSize !== buffer.length)
    throw new Error('Invalid HSD length');
  const blocks = new Map();
  let offset = 0;
  for (let expected = 1; expected <= 11; expected++) {
    if (offset + 5 > headerSize || buffer[offset] !== expected)
      throw new Error('Invalid HSD block');
    const length =
      expected === 10 ? buffer.readUInt32LE(offset + 1) : buffer.readUInt16LE(offset + 1);
    if (length < 3 || offset + length > headerSize) throw new Error('Invalid HSD block length');
    blocks.set(expected, buffer.subarray(offset, offset + length));
    offset += length;
  }
  if (offset !== headerSize) throw new Error('Invalid HSD header');
  const data = blocks.get(2),
    projection = blocks.get(3),
    cal = blocks.get(5),
    segment = blocks.get(7);
  const width = data.readUInt16LE(5),
    height = data.readUInt16LE(7);
  if (
    data.readUInt16LE(3) !== 16 ||
    data[9] !== 0 ||
    width !== 5500 ||
    height !== 550 ||
    dataSize !== width * height * 2 ||
    cal.readUInt16LE(3) !== 13
  )
    throw new Error('Unsupported HSD data');
  const number = segment[4],
    firstLine = segment.readUInt16LE(5);
  if (segment[3] !== 10 || number < 1 || number > 10 || firstLine !== (number - 1) * height + 1)
    throw new Error('Invalid HSD segment');
  const nav = {
    longitude: projection.readDoubleLE(3),
    cfac: projection.readUInt32LE(11),
    lfac: projection.readUInt32LE(15),
    coff: projection.readFloatLE(19),
    loff: projection.readFloatLE(23),
    distance: projection.readDoubleLE(27),
    equatorial: projection.readDoubleLE(35),
    polar: projection.readDoubleLE(43),
  };
  if (
    !Object.values(nav).every(Number.isFinite) ||
    nav.cfac <= 0 ||
    nav.lfac <= 0 ||
    nav.distance < 40000 ||
    nav.distance > 45000 ||
    nav.equatorial < 6300 ||
    nav.equatorial > 6400 ||
    nav.polar < 6300 ||
    nav.polar > 6400
  )
    throw new Error('Invalid HSD navigation');
  const calibration = {
    wavelength: cal.readDoubleLE(5),
    bits: cal.readUInt16LE(13),
    error: cal.readUInt16LE(15),
    outside: cal.readUInt16LE(17),
    gain: cal.readDoubleLE(19),
    offset: cal.readDoubleLE(27),
    c0: cal.readDoubleLE(35),
    c1: cal.readDoubleLE(43),
    c2: cal.readDoubleLE(51),
    light: cal.readDoubleLE(83),
    planck: cal.readDoubleLE(91),
    boltzmann: cal.readDoubleLE(99),
  };
  if (
    !Object.values(calibration).every(Number.isFinite) ||
    calibration.bits !== 12 ||
    calibration.wavelength < 10 ||
    calibration.wavelength > 11
  )
    throw new Error('Invalid HSD calibration');
  const temperatures = new Float32Array(4096);
  for (let count = 0; count < temperatures.length; count++)
    temperatures[count] = brightnessTemperature(count, calibration);
  return {
    width,
    height,
    number,
    firstLine,
    nav,
    filename: buffer.subarray(114, 242).toString().replace(/\0.*$/, ''),
    temperatures,
    pixels: Buffer.from(buffer.subarray(headerSize)),
  };
}

export function brightnessTemperature(count, c) {
  if (count === c.error || count === c.outside || count < 0 || count >= 2 ** c.bits) return NaN;
  const radiance = count * c.gain + c.offset,
    lambda = c.wavelength * 1e-6;
  if (!(radiance > 0)) return NaN;
  const effective =
    (c.planck * c.light) /
    (c.boltzmann *
      lambda *
      Math.log1p((2 * c.planck * c.light ** 2) / (lambda ** 5 * radiance * 1e6)));
  const value = c.c0 + c.c1 * effective + c.c2 * effective ** 2;
  return Number.isFinite(value) && value >= 100 && value <= 400 ? value : NaN;
}

export function hsdPixel(lat, lng, p) {
  const rad = Math.PI / 180,
    phi = lat * rad,
    lambda = (lng - p.longitude) * rad,
    e2 = 1 - (p.polar / p.equatorial) ** 2;
  const n = p.equatorial / Math.sqrt(1 - e2 * Math.sin(phi) ** 2),
    X = n * Math.cos(phi) * Math.cos(lambda),
    Y = n * Math.cos(phi) * Math.sin(lambda),
    Z = n * (1 - e2) * Math.sin(phi);
  if (p.distance * X < X * X + Y * Y + (Z * Z) / (1 - e2)) return null;
  const sx = Math.atan2(Y, p.distance - X),
    sy = Math.asin(-Z / Math.hypot(p.distance - X, Y, Z));
  return [p.coff + ((sx / rad) * p.cfac) / 65536 - 1, p.loff + ((sy / rad) * p.lfac) / 65536 - 1];
}

// JEJAK IR palette in kelvin. Applied to interpolated temperatures, never to RGB neighbours.
export const IR_PALETTE = [
  [173.15, [255, 240, 255]],
  [183.15, [205, 80, 190]],
  [193.15, [100, 0, 30]],
  [203.15, [185, 0, 0]],
  [213.15, [255, 65, 0]],
  [223.15, [255, 235, 0]],
  [233.15, [0, 215, 125]],
  [240.15, [0, 150, 255]],
  [241.15, [245, 245, 245]],
  [273.15, [150, 150, 150]],
  [303.15, [65, 65, 65]],
  [333.15, [25, 25, 25]],
];
export function temperatureColor(value) {
  if (!Number.isFinite(value)) return [0, 0, 0, 0];
  if (value <= IR_PALETTE[0][0]) return [...IR_PALETTE[0][1], 255];
  for (let i = 1; i < IR_PALETTE.length; i++) {
    const [high, b] = IR_PALETTE[i],
      [low, a] = IR_PALETTE[i - 1];
    if (value <= high) {
      const f = (value - low) / (high - low);
      return [...a.map((v, c) => Math.round(v + (b[c] - v) * f)), 255];
    }
  }
  return [...IR_PALETTE.at(-1)[1], 255];
}
export function interpolateTemperature(values, fx, fy) {
  const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
  let result = 0;
  for (let i = 0; i < 4; i++) {
    if (weights[i] === 0) continue;
    if (!Number.isFinite(values[i])) return NaN;
    result += values[i] * weights[i];
  }
  return result;
}
