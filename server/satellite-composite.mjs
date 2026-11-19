import sharp from 'sharp';
const radians = Math.PI / 180;
export function daylightWeight(time, longitude, latitude) {
  const date = new Date(time);
  const day = (time - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000;
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
  const gamma = ((2 * Math.PI) / 365) * (Math.floor(day) + (hour - 12) / 24);
  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const equation =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const angle = (hour * 15 + longitude + equation / 4 - 180) * radians;
  const sine =
    Math.sin(latitude * radians) * Math.sin(declination) +
    Math.cos(latitude * radians) * Math.cos(declination) * Math.cos(angle);
  const t = Math.max(0, Math.min(1, sine / Math.sin(8 * radians)));
  return t * t * (3 - 2 * t);
}
export async function blendSatellite(visible, infrared, time, z, x, y, blue = false) {
  const decode = async (buffer) => {
    const result = await sharp(buffer, { limitInputPixels: 256 * 256 })
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (result.info.width !== 256 || result.info.height !== 256 || result.info.channels !== 3)
      throw new Error('Unexpected satellite tile dimensions');
    return result.data;
  };
  const [vis, ir] = await Promise.all([decode(visible), decode(infrared)]);
  const pixels = Buffer.alloc(256 * 256 * 3),
    n = 2 ** z;
  for (let row = 0; row < 256; row++) {
    const latitude =
      Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + (row + 0.5) / 256)) / n))) / radians;
    for (let col = 0; col < 256; col++) {
      const longitude = ((x + (col + 0.5) / 256) / n) * 360 - 180;
      const weight = daylightWeight(time, longitude, latitude),
        offset = (row * 256 + col) * 3;
      for (let channel = 0; channel < 3; channel++)
        pixels[offset + channel] = Math.round(
          vis[offset + channel] * weight +
            ir[offset + channel] * (blue ? [0.78, 0.9, 1][channel] : 1) * (1 - weight),
        );
    }
  }
  return sharp(pixels, { raw: { width: 256, height: 256, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
}
