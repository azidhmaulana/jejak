import type { Map as LibreMap } from 'maplibre-gl';

const colors = { high: '#ff5252', medium: '#ffad42', low: '#ffdf78', unknown: '#aaaaaa' };

export function installHotspotIcons(map: LibreMap) {
  for (const [confidence, color] of Object.entries(colors)) {
    const id = `jejak-hotspot-fire-${confidence}`;
    if (map.hasImage(id)) continue;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.scale(2, 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(16, 16, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(16, 16, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#41250e';
    ctx.lineWidth = 0.7;
    const flame = new Path2D('M16 5 C18 10 23 12 23 19 C23 24 20 27 16 27 C11 27 8 24 8 20 C8 17 10 14 12 12 C12 15 13 16 14 16 C17 13 17 9 16 5 Z');
    ctx.fill(flame);
    ctx.stroke(flame);
    ctx.fillStyle = '#fffaf0';
    ctx.fill(new Path2D('M16 16 C17 19 20 20 20 23 C20 25 18 26 16 26 C13 26 12 24 12 22 C12 20 14 18 16 16 Z'));
    map.addImage(id, ctx.getImageData(0, 0, 64, 64), { pixelRatio: 2 });
  }
}
