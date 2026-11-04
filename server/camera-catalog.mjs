import { readFileSync } from 'node:fs';

export const cameraCatalogs = [
  'bandungCameras.json',
  'bandungPublicCameras.json',
  'garutCameras.json',
  'jabarCameras.json',
  'mudikCameras.json',
  'regionalCameras.json',
].map((file) =>
  JSON.parse(
    readFileSync(new URL(`../src/features/surveillance/data/${file}`, import.meta.url), 'utf8'),
  ),
);
export const publicCameras = cameraCatalogs.flatMap((catalog) => catalog.cameras);
