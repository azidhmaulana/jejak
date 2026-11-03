import type { Drawing, DrawingFolder, DrawingStyle } from './mapToolsStore';
import { drawingStyle, styleProperties } from './drawingStyle';
import { validatePolygonRings } from '../maps/polygonValidation';

export interface DrawingImport {
  features: Drawing[];
  folders: DrawingFolder[];
  warnings: string[];
  name: string;
}
export const IMPORT_MAX_BYTES = 5_000_000;
type Json = Record<string, unknown>;
const record = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
const label = (value: unknown, fallback: string, max = 100) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;

/** Parse local content only; KML links, scripts and external resources are never loaded. */
export function parseDrawingImport(
  text: string,
  filename: string,
  defaults: DrawingStyle,
): DrawingImport {
  if (new Blob([text]).size > IMPORT_MAX_BYTES) throw Error('Maksimal ukuran file 5 MB.');
  const result: DrawingImport = { name: filename, features: [], folders: [], warnings: [] };
  const groups = new Map<string, string>();
  let vertices = 0,
    skipped = 0;
  const groupId = (name: string) => {
    if (!groups.has(name)) {
      const id = crypto.randomUUID();
      groups.set(name, id);
      result.folders.push({ id, name: name.slice(0, 80), visible: true, collapsed: false });
    }
    return groups.get(name)!;
  };
  const point = (value: unknown): number[] => {
    if (
      !Array.isArray(value) ||
      value.length < 2 ||
      value.some((n) => typeof n !== 'number' || !Number.isFinite(n)) ||
      Math.abs(value[0]) > 180 ||
      Math.abs(value[1]) > 90
    )
      throw Error('Koordinat tidak valid. Gunakan WGS84 (longitude, latitude).');
    vertices++;
    if (vertices > 60000) throw Error('Maksimal 60.000 titik koordinat per import.');
    return value.slice(0, 2).map((n) => Number(n.toFixed(9)));
  };
  const add = (value: unknown, properties: Json, group: string, depth = 0) => {
    if (depth > 20) throw Error('Struktur geometri terlalu dalam.');
    const geometry = record(value),
      type = geometry.type;
    if (type === 'GeometryCollection') {
      if (!Array.isArray(geometry.geometries)) throw Error('GeometryCollection tidak valid.');
      geometry.geometries.forEach((g) => add(g, properties, group, depth + 1));
      return;
    }
    if (type === 'MultiPoint' || type === 'MultiLineString' || type === 'MultiPolygon') {
      if (!Array.isArray(geometry.coordinates)) throw Error('Multi geometry tidak valid.');
      geometry.coordinates.forEach((coordinates) =>
        add({ type: String(type).slice(5), coordinates }, properties, group, depth + 1),
      );
      return;
    }
    if (!['Point', 'LineString', 'Polygon'].includes(String(type))) {
      skipped++;
      return;
    }
    const before = vertices;
    let coordinates: unknown;
    if (type === 'Point') coordinates = point(geometry.coordinates);
    else {
      if (!Array.isArray(geometry.coordinates)) throw Error('Koordinat geometri tidak lengkap.');
      if (type === 'LineString') {
        if (geometry.coordinates.length < 2) throw Error('Garis minimal dua titik.');
        coordinates = geometry.coordinates.map(point);
      } else {
        if (!geometry.coordinates.length) throw Error('Polygon kosong.');
        coordinates = geometry.coordinates.map((value) => {
          if (!Array.isArray(value) || value.length < 4)
            throw Error('Ring polygon minimal empat titik termasuk penutup.');
          const ring = value.map(point);
          if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
            throw Error('Ring polygon harus tertutup.');
          return ring;
        });
      }
    }
    if (vertices - before > 20000) throw Error('Maksimal 20.000 titik per objek.');
    if (type === 'Polygon') validatePolygonRings(coordinates as number[][][]);
    if (result.features.length >= 500) throw Error('Maksimal 500 objek per import.');
    const mode = type === 'Point' ? 'point' : type === 'LineString' ? 'linestring' : 'polygon';
    const style = drawingStyle({ properties } as Drawing, defaults);
    result.features.push({
      type: 'Feature',
      id: crypto.randomUUID(),
      geometry: { type, coordinates },
      properties: {
        mode,
        ...styleProperties(style),
        bmsName: label(
          properties.bmsName ?? properties.name,
          `Objek ${result.features.length + 1}`,
        ),
        bmsNotes: label(properties.bmsNotes ?? properties.description, '', 2000),
        bmsFolderId: groupId(group),
        bmsVisible: true,
        bmsLocked: false,
        bmsZone: ['guard', 'white'].includes(String(properties.bmsZone))
          ? properties.bmsZone
          : 'none',
        bmsOrder: Date.now() + result.features.length,
      },
    } as Drawing);
  };
  const rootGroup = filename.replace(/\.(kml|geojson|json)$/i, '') || 'Import';
  if (/\.kml$/i.test(filename) || text.trimStart().startsWith('<')) {
    if (/<!DOCTYPE|<!ENTITY/i.test(text))
      throw Error('KML dengan deklarasi entity tidak didukung.');
    const document = new DOMParser().parseFromString(text, 'application/xml');
    if (
      document.getElementsByTagName('parsererror').length ||
      document.documentElement.localName !== 'kml'
    )
      throw Error('File KML tidak valid.');
    const children = (node: Element, name: string) =>
      Array.from(node.children).filter((child) => child.localName === name);
    const first = (node: Element, name: string) => children(node, name)[0];
    const content = (node: Element, name: string) => first(node, name)?.textContent?.trim() || '';
    const coords = (node: Element) => {
      const raw = node.getElementsByTagNameNS('*', 'coordinates')[0]?.textContent?.trim();
      if (!raw) throw Error('Koordinat KML kosong.');
      return raw
        .split(/\s+/)
        .map((tuple) => tuple.split(',').map((n) => (n.trim() === '' ? NaN : Number(n))));
    };
    for (const placemark of Array.from(document.getElementsByTagNameNS('*', 'Placemark'))) {
      const path: string[] = [];
      let parent = placemark.parentElement;
      while (parent) {
        if (parent.localName === 'Folder') path.unshift(content(parent, 'name') || 'Group');
        parent = parent.parentElement;
      }
      const properties: Json = {
        name: content(placemark, 'name'),
        description: content(placemark, 'description'),
      };
      const inline = first(placemark, 'Style');
      const styleUrl = content(placemark, 'styleUrl');
      const style =
        inline ||
        (styleUrl.startsWith('#')
          ? Array.from(document.getElementsByTagNameNS('*', 'Style')).find(
              (node) => node.id === styleUrl.slice(1),
            )
          : undefined);
      if (style) {
        const line = first(style, 'LineStyle'),
          poly = first(style, 'PolyStyle');
        const color = line && content(line, 'color');
        if (color && /^[\da-f]{8}$/i.test(color))
          properties.drawColor = `#${color.slice(6, 8)}${color.slice(4, 6)}${color.slice(2, 4)}`;
        if (line && content(line, 'width')) properties.drawWidth = Number(content(line, 'width'));
        if (poly && content(poly, 'fill') === '0') properties.drawFillStyle = 'none';
      }
      const geometries = Array.from(placemark.getElementsByTagNameNS('*', '*')).filter((node) =>
        ['Point', 'LineString', 'Polygon'].includes(node.localName),
      );
      if (!geometries.length) skipped++;
      for (const node of geometries) {
        let coordinates: unknown;
        if (node.localName === 'Point') {
          const points = coords(node);
          if (points.length !== 1) throw Error('Point KML harus satu koordinat.');
          coordinates = points[0];
        } else if (node.localName === 'LineString') coordinates = coords(node);
        else {
          const outer = first(node, 'outerBoundaryIs');
          if (!outer) throw Error('Polygon KML tanpa batas luar.');
          coordinates = [coords(outer), ...children(node, 'innerBoundaryIs').map(coords)];
        }
        add(
          { type: node.localName, coordinates },
          properties,
          path.length ? path.join(' / ') : rootGroup,
        );
      }
    }
    if (document.getElementsByTagNameNS('*', 'NetworkLink').length)
      result.warnings.push('NetworkLink diabaikan; hanya geometri dalam file yang diimport.');
  } else {
    let input: Json;
    try {
      input = record(JSON.parse(text));
    } catch {
      throw Error('File JSON tidak valid.');
    }
    if (input.crs)
      throw Error('CRS khusus tidak didukung. Ekspor ulang sebagai WGS84 / EPSG:4326.');
    const bms = record(input.bms);
    const folders = Array.isArray(bms.folders) ? bms.folders.map(record) : [];
    const visit = (value: unknown) => {
      const feature = record(value);
      if (feature.type === 'Feature') {
        const p = record(feature.properties),
          group = folders.find((f) => f.id === p.bmsFolderId);
        add(feature.geometry, p, label(group?.name ?? p.group, rootGroup, 80));
      } else add(feature, {}, rootGroup);
    };
    if (input.type === 'FeatureCollection') {
      if (!Array.isArray(input.features)) throw Error('FeatureCollection tanpa daftar features.');
      input.features.forEach(visit);
    } else visit(input);
  }
  if (!result.features.length)
    throw Error('Tidak ada Point, LineString, atau Polygon yang dapat diimport.');
  if (
    result.features.some((f) => f.geometry.type === 'Polygon' && f.geometry.coordinates.length > 1)
  )
    result.warnings.push(
      'Polygon dengan lubang tetap utuh; ubah posisi/ukurannya melalui panel properti. Edit titik di peta belum tersedia untuk bentuk ini.',
    );
  if (skipped) result.warnings.push(`${skipped} geometri kosong/tidak didukung dilewati.`);
  if (new Blob([JSON.stringify(result)]).size > 3_500_000)
    throw Error('Data import terlalu besar setelah konversi. Pecah file menjadi beberapa bagian.');
  return result;
}
