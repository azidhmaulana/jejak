import { useEffect } from 'react';
import type { Map as MapLibreMap, CanvasSource, LngLat } from 'maplibre-gl';
import { useOsintWeather, weatherStatus } from './osintWeatherStore';
import { interpolateWind, validWindGrid, type WindGrid } from './windGrid';
import { windColor, windRgb } from './windColors';

export default function WindLayer({ map }: { map: MapLibreMap | null }) {
  const enabled = useOsintWeather((s) => s.wind);
  useEffect(() => {
    if (!map || !enabled) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'osint-wind-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.display = 'none';
    map.getCanvasContainer().appendChild(canvas);
    const background = document.createElement('canvas');
    background.className = 'osint-wind-canvas osint-wind-speed';
    background.setAttribute('aria-hidden', 'true');
    background.style.display = 'none';
    canvas.before(background);
    const backgroundContext = background.getContext('2d');
    const composite = document.createElement('canvas');
    const compositeContext = composite.getContext('2d');
    const scratch = document.createElement('canvas');
    const scratchContext = scratch.getContext('2d');
    const sourceId = 'jejak-wind-flow';
    const coordinates = (): [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ] =>
      [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ].map(([x, y]) => {
        const point = map.unproject([x, y]);
        return [point.lng, point.lat];
      }) as [[number, number], [number, number], [number, number], [number, number]];
    let installing = false;
    const install = () => {
      if (installing || !width || !height || (!map.getSource(sourceId) && !map.isStyleLoaded()))
        return;
      installing = true;
      try {
        if (!map.getSource(sourceId))
          map.addSource(sourceId, {
            type: 'canvas',
            canvas: composite,
            coordinates: coordinates(),
            animate: true,
          });
        if (!map.getLayer(sourceId))
          map.addLayer({
            id: sourceId,
            type: 'raster',
            source: sourceId,
            paint: { 'raster-fade-duration': 0 },
          });
        const layers = map.getStyle().layers || [];
        const overlay = layers.find(
          (layer) =>
            layer.id !== sourceId &&
            (layer.type === 'circle' ||
              layer.type === 'symbol' ||
              /jejak-(province|camera|earthquake|hotspot|route)|terra-draw/i.test(layer.id)),
        );
        if (overlay && layers.findIndex((layer) => layer.id === sourceId) > layers.indexOf(overlay))
          map.moveLayer(sourceId, overlay.id);
      } finally {
        installing = false;
      }
    };
    const present = () => {
      if (!compositeContext || !width || !height) return;
      if (composite.width !== canvas.width || composite.height !== canvas.height) {
        composite.width = canvas.width;
        composite.height = canvas.height;
      }
      compositeContext.clearRect(0, 0, composite.width, composite.height);
      compositeContext.globalAlpha = useOsintWeather.getState().windOpacity;
      compositeContext.drawImage(background, 0, 0, composite.width, composite.height);
      compositeContext.drawImage(canvas, 0, 0);
      if (!map.getLayer(sourceId)) install();
      map.triggerRepaint();
    };
    const ctx = canvas.getContext('2d');
    if (!ctx || !backgroundContext || !compositeContext || !scratchContext) {
      background.remove();
      canvas.remove();
      return;
    }
    let grid: WindGrid | null = null,
      controller: AbortController | undefined,
      disposed = false;
    let width = 0,
      height = 0,
      cols = 0,
      rows = 0,
      field = new Float32Array(),
      animation = 0,
      last = 0;
    let anchors: LngLat[] = [];
    let previousPitch = map.getPitch();
    let previousZoom = map.getZoom();
    const rememberView = () => {
      anchors = [
        [0, 0],
        [width, 0],
        [0, height],
      ].map(([x, y]) => map.unproject([x, y]));
      previousPitch = map.getPitch();
    };
    const moveTrails = () => {
      if (!width || !height || anchors.length !== 3) return;
      if (map.getPitch() !== previousPitch) {
        ctx.clearRect(0, 0, width, height);
      } else {
        const [origin, right, bottom] = anchors.map((point) => map.project(point));
        const a = (right.x - origin.x) / width,
          b = (right.y - origin.y) / width;
        const c = (bottom.x - origin.x) / height,
          d = (bottom.y - origin.y) / height;
        const ratio = canvas.width / width;
        scratch.width = canvas.width;
        scratch.height = canvas.height;
        scratchContext.setTransform(a, b, c, d, origin.x * ratio, origin.y * ratio);
        scratchContext.drawImage(canvas, 0, 0);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(scratch, 0, 0);
        ctx.restore();
        for (const particle of particles) {
          const x = particle.x * width,
            y = particle.y * height;
          particle.x = (a * x + c * y + origin.x) / width;
          particle.y = (b * x + d * y + origin.y) / height;
        }
      }
    };
    const cell = 12;
    const particles: { x: number; y: number; age: number }[] = [];
    const project = () => {
      const rect = map.getCanvas().getBoundingClientRect(),
        ratio = Math.min(devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      const changed =
        canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio);
      if (changed) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
      cols = Math.ceil(width / cell) + 1;
      rows = Math.ceil(height / cell) + 1;
      field = new Float32Array(cols * rows * 2);
      background.width = cols;
      background.height = rows;
      background.style.width = `${(cols - 1) * cell}px`;
      background.style.height = `${(rows - 1) * cell}px`;
      const count = Math.min(
        width <= 700 ? 3000 : 14000,
        Math.round((width * height) / (width <= 700 ? 170 : 110)),
      );
      if (particles.length !== count) {
        particles.length = 0;
        for (let i = 0; i < count; i++)
          particles.push({ x: Math.random(), y: Math.random(), age: Math.random() * 8 });
      }
      if (!grid) {
        rememberView();
        return;
      }
      const colors = backgroundContext.createImageData(cols, rows);
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const location = map.unproject([x * cell, y * cell]);
          const wind = interpolateWind(grid, location.lng, location.lat);
          if (!wind) continue;
          const [u, v] = wind,
            speed = Math.hypot(u, v);
          const pixel = (y * cols + x) * 4;
          colors.data.set([...windRgb(speed), 200], pixel);
          if (speed < 0.01) continue;
          const dest = map.project([
            location.lng + (u * 0.001) / Math.max(0.05, Math.cos((location.lat * Math.PI) / 180)),
            Math.max(-85, Math.min(85, location.lat + v * 0.001)),
          ]);
          const dx = dest.x - x * cell,
            dy = dest.y - y * cell,
            length = Math.hypot(dx, dy);
          if (length > 0) {
            const i = (y * cols + x) * 2;
            field[i] = (dx / length) * speed;
            field[i + 1] = (dy / length) * speed;
          }
        }
      backgroundContext.putImageData(colors, 0, 0);
      rememberView();
      (map.getSource(sourceId) as CanvasSource | undefined)?.setCoordinates(coordinates());
    };
    const load = async () => {
      controller?.abort();
      const request = (controller = new AbortController());
      const state = useOsintWeather.getState(),
        hour = state.windTime ? state.windHour : 0;
      grid = null;
      project();
      useOsintWeather.setState({ windValidTime: null, windReferenceTime: null });
      weatherStatus('wind', 'Loading NOAA GFS grid…');
      const timeout = setTimeout(() => request.abort(), 120000);
      try {
        const response = await fetch(`/api/weather/wind?hour=${hour}`, { signal: request.signal });
        if (!response.ok) throw new Error('Unavailable');
        const result = await response.json();
        if (disposed || controller !== request) return;
        if (!validWindGrid(result)) throw new Error('Invalid wind grid');
        grid = result;
        project();
        useOsintWeather.setState({
          windValidTime: result.validTime,
          windReferenceTime: result.referenceTime,
        });
        weatherStatus('wind', 'NOAA GFS · 1° global grid · bilinear · 10 m');
      } catch {
        if (!disposed && controller === request)
          weatherStatus('wind', 'NOAA GFS unavailable. Toggle wind to retry.');
      } finally {
        clearTimeout(timeout);
      }
    };
    const sample = (x: number, y: number): [number, number] => {
      const gx = x / cell,
        gy = y / cell,
        ix = Math.floor(gx),
        iy = Math.floor(gy),
        a = gx - ix,
        b = gy - iy;
      const i = (iy * cols + ix) * 2;
      const component = (offset: number) =>
        field[i + offset] * (1 - a) * (1 - b) +
        field[i + 2 + offset] * a * (1 - b) +
        field[i + cols * 2 + offset] * (1 - a) * b +
        field[i + cols * 2 + 2 + offset] * a * b;
      return [component(0), component(1)];
    };
    const draw = (now: number) => {
      animation = requestAnimationFrame(draw);
      if (document.hidden || now - last < 33) return;
      const dt = Math.min((now - last) / 1000, 0.06);
      last = now;
      if (!grid || !width || !height) {
        ctx.clearRect(0, 0, width, height);
        present();
        return;
      }
      if (
        !useOsintWeather.getState().particles ||
        matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        ctx.clearRect(0, 0, width, height);
        for (let y = 40; y < height; y += 80)
          for (let x = 40; x < width; x += 80) {
            const [u, v] = sample(x, y),
              speed = Math.hypot(u, v);
            if (speed < 0.1) continue;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.atan2(v, u));
            ctx.strokeStyle = windColor(speed);
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(-8, 0);
            ctx.lineTo(8, 0);
            ctx.lineTo(3, -4);
            ctx.moveTo(8, 0);
            ctx.lineTo(3, 4);
            ctx.stroke();
            ctx.restore();
          }
        present();
        return;
      }
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = `rgba(0,0,0,${Math.pow(0.975, dt * 30)})`;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 0.65;
      ctx.lineCap = 'round';
      for (const p of particles) {
        if (p.age > 8 || p.x < 0 || p.x >= 1 || p.y < 0 || p.y >= 1) {
          p.x = Math.random();
          p.y = Math.random();
          p.age = 0;
        }
        const x = p.x * width,
          y = p.y * height,
          [u, v] = sample(x, y);
        if (!Number.isFinite(u) || !Number.isFinite(v)) {
          p.age = 9;
          continue;
        }
        const midX = Math.max(0, Math.min(width - 0.01, x + u * dt * 1.5));
        const midY = Math.max(0, Math.min(height - 0.01, y + v * dt * 1.5));
        const [nextU, nextV] = sample(midX, midY);
        p.x += (nextU * dt * 3) / width;
        p.y += (nextV * dt * 3) / height;
        p.age += dt;
        ctx.strokeStyle = '#d6eff5';
        ctx.globalAlpha = 0.48 * Math.max(0, Math.min(1, p.age, 8 - p.age));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(p.x * width, p.y * height);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      present();
    };
    void load();
    animation = requestAnimationFrame(draw);
    const onMove = () => {
      const zoomChanged = Math.abs(map.getZoom() - previousZoom) > 0.000001;
      if (!zoomChanged) moveTrails();
      project();
      if (zoomChanged && grid) {
        // Rebuild a uniform screen density: shrinking the old bitmap leaves a dense rectangle.
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = '#d6eff5';
        ctx.lineWidth = 0.65;
        const columns = Math.ceil(Math.sqrt((particles.length * width) / height));
        const rows = Math.ceil(particles.length / columns);
        particles.forEach((particle, index) => {
          const jitterX = (index * 0.61803398875) % 1;
          const jitterY = (index * 0.41421356237) % 1;
          particle.x = ((index % columns) + jitterX) / columns;
          particle.y = (Math.floor(index / columns) + jitterY) / rows;
          particle.age = 1 + jitterX * 6;
          if (
            !useOsintWeather.getState().particles ||
            matchMedia('(prefers-reduced-motion: reduce)').matches
          )
            return;
          let x = particle.x * width,
            y = particle.y * height;
          for (let step = 0; step < 12; step++) {
            const [u, v] = sample(x, y);
            if (!Number.isFinite(u + v)) break;
            const nextX = x - u * 0.16,
              nextY = y - v * 0.16;
            if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) break;
            ctx.globalAlpha = 0.24 * (1 - step / 12);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(nextX, nextY);
            ctx.stroke();
            x = nextX;
            y = nextY;
          }
        });
        ctx.globalAlpha = 1;
      }
      previousZoom = map.getZoom();
      present();
    };
    map.on('move', onMove);
    map.on('styledata', install);
    map.on('resize', project);
    const unsubscribe = useOsintWeather.subscribe((s, p) => {
      if (s.windHour !== p.windHour || s.windTime !== p.windTime) void load();
    });
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 20 * 60000);
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(timer);
      cancelAnimationFrame(animation);
      unsubscribe();
      map.off('move', onMove);
      map.off('styledata', install);
      if (map.getLayer(sourceId)) map.removeLayer(sourceId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      map.off('resize', project);
      canvas.remove();
      background.remove();
    };
  }, [map, enabled]);
  return null;
}
