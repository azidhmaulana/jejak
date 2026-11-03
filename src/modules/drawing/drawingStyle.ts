import type { Drawing, DrawingStyle, FillStyle, LineStyle } from './mapToolsStore';

export const lineStyles: LineStyle[] = ['solid', 'dashed', 'dotted', 'dash-dot'];
export const fillStyles: FillStyle[] = ['none', 'solid', 'hatch', 'crosshatch'];
export function drawingStyle(feature: Drawing, fallback?: DrawingStyle): DrawingStyle {
  const p = feature.properties;
  return {
    color: /^#[\da-f]{6}$/i.test(String(p.drawColor))
      ? String(p.drawColor)
      : fallback?.color || '#00c8f4',
    width: Math.max(1, Math.min(10, Number(p.drawWidth) || fallback?.width || 2)),
    lineStyle: lineStyles.includes(p.drawLineStyle as LineStyle)
      ? (p.drawLineStyle as LineStyle)
      : fallback?.lineStyle || 'solid',
    fillStyle: fillStyles.includes(p.drawFillStyle as FillStyle)
      ? (p.drawFillStyle as FillStyle)
      : fallback?.fillStyle || 'solid',
    fillOpacity:
      typeof p.drawFillOpacity === 'number'
        ? Math.max(0, Math.min(100, p.drawFillOpacity))
        : (fallback?.fillOpacity ?? 16),
  };
}
export const styleProperties = (style: DrawingStyle) => ({
  drawColor: style.color,
  drawWidth: style.width,
  drawLineStyle: style.lineStyle,
  drawFillStyle: style.fillStyle,
  drawFillOpacity: style.fillOpacity,
});
