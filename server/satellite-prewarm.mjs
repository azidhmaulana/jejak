// Prepare the default Indonesia view once per observation, sharing normal tile caches.
export function createSatellitePrewarm({ render, busy = () => false }) {
  let running = false,
    latest = '',
    completed = '';
  return function schedule(frame) {
    latest = frame;
    if (running || completed === latest) return;
    running = true;
    void (async () => {
      try {
        while (latest !== completed) {
          const frame = latest;
          for (const product of ['blue', 'enhanced']) {
            for (const x of [12, 13, 14])
              for (const y of [7, 8]) {
                if (latest !== frame || busy()) break;
                await render(frame, 4, x, y, product).catch(() => {});
                await new Promise((resolve) => setImmediate(resolve));
              }
          }
          completed = frame;
        }
      } finally {
        running = false;
      }
    })();
  };
}
