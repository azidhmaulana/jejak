export type ScalarField =
  | 'gust'
  | 'pressure'
  | 'temperature'
  | 'dewpoint'
  | 'humidity'
  | 'wetbulb'
  | 'solar'
  | 'uv'
  | 'surface';
export const scalarFields: Record<
  ScalarField,
  { en: string; id: string; unit: string; stops: [number, string][] }
> = {
  gust: {
    en: 'Wind gusts',
    id: 'Embusan angin',
    unit: 'mph',
    stops: [
      [0, '#365c91'],
      [15, '#36ada9'],
      [30, '#6bd658'],
      [50, '#f9d34c'],
      [75, '#f3573e'],
      [110, '#a41e89'],
    ],
  },
  pressure: {
    en: 'Pressure',
    id: 'Tekanan',
    unit: 'hPa',
    stops: [
      [980, '#6354a3'],
      [1000, '#328cbd'],
      [1010, '#65b9a2'],
      [1020, '#c8cf72'],
      [1040, '#c55b51'],
    ],
  },
  temperature: {
    en: 'Temperature',
    id: 'Suhu',
    unit: '\u00b0C',
    stops: [
      [-20, '#6352aa'],
      [0, '#368dc3'],
      [15, '#69b749'],
      [20, '#e5d522'],
      [25, '#ff9108'],
      [30, '#ff6b08'],
      [35, '#e74712'],
      [45, '#a52638'],
    ],
  },
  dewpoint: {
    en: 'Dew point',
    id: 'Titik embun',
    unit: '\u00b0C',
    stops: [
      [-20, '#826948'],
      [0, '#c1ba76'],
      [10, '#93c387'],
      [20, '#3cacba'],
      [30, '#475bad'],
    ],
  },
  humidity: {
    en: 'Humidity',
    id: 'Kelembapan',
    unit: '%',
    stops: [
      [0, '#bc8557'],
      [25, '#d6bd78'],
      [50, '#9fc99b'],
      [75, '#4ba9b7'],
      [100, '#415a9d'],
    ],
  },
  wetbulb: {
    en: 'Wet-bulb temperature',
    id: 'Suhu bola basah',
    unit: '\u00b0C',
    stops: [
      [-20, '#535d9a'],
      [0, '#499dc0'],
      [15, '#8ec1a0'],
      [25, '#e8cf68'],
      [30, '#e8894e'],
      [35, '#b13c50'],
    ],
  },
  solar: {
    en: 'Solar radiation',
    id: 'Radiasi surya',
    unit: 'W/m\u00b2',
    stops: [
      [0, '#3c405e'],
      [200, '#795f8f'],
      [400, '#cc866d'],
      [600, '#eaaa63'],
      [800, '#f3cc62'],
      [1000, '#fff0b1'],
    ],
  },
  uv: {
    en: 'UV index',
    id: 'Indeks UV',
    unit: 'UVI',
    stops: [
      [0, '#6bb35a'],
      [3, '#e6cf4c'],
      [6, '#ee9644'],
      [8, '#d5434a'],
      [11, '#9653aa'],
      [16, '#704594'],
    ],
  },
  surface: { en: 'Surface heat / MODIS', id: 'Panas permukaan / MODIS', unit: 'K', stops: [] },
};
export type ScalarGrid = {
  nx: number;
  ny: number;
  dx: number;
  dy: number;
  lon0: number;
  lat0: number;
  values: (number | null)[];
  validTime: number;
  referenceTime: number;
  field: ScalarField;
  interval?: string;
  derived?: boolean;
};
export function validScalarGrid(g: ScalarGrid): boolean {
  return (
    g?.nx === 360 &&
    g.ny === 181 &&
    g.dx === 1 &&
    g.dy === 1 &&
    g.lon0 === 0 &&
    g.lat0 === 90 &&
    Number.isFinite(g.validTime) &&
    Number.isFinite(g.referenceTime) &&
    Array.isArray(g.values) &&
    g.values.length === 65160 &&
    g.values.every((v) => v === null || (Number.isFinite(v) && Math.abs(v) < 2000))
  );
}
export function sampleScalar(g: ScalarGrid, lng: number, lat: number): number | null {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  const x = ((lng % 360) + 360) % 360,
    y = 90 - lat,
    x0 = Math.floor(x),
    x1 = (x0 + 1) % 360,
    y0 = Math.min(179, Math.floor(y)),
    a = x - x0,
    b = y - y0;
  const v = [
    g.values[y0 * 360 + x0],
    g.values[y0 * 360 + x1],
    g.values[(y0 + 1) * 360 + x0],
    g.values[(y0 + 1) * 360 + x1],
  ];
  if (v.some((n) => n === null)) return null;
  return v[0]! * (1 - a) * (1 - b) + v[1]! * a * (1 - b) + v[2]! * (1 - a) * b + v[3]! * a * b;
}
export function scalarRgb(field: ScalarField, value: number): number[] {
  const stops = scalarFields[field].stops;
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  if (value <= stops[0][0]) return rgb(stops[0][1]);
  for (let i = 1; i < stops.length; i++)
    if (value <= stops[i][0]) {
      const a = stops[i - 1],
        b = stops[i],
        t = (value - a[0]) / (b[0] - a[0]);
      return rgb(a[1]).map((n, j) => Math.round(n + (rgb(b[1])[j] - n) * t));
    }
  return rgb(stops[stops.length - 1][1]);
}
