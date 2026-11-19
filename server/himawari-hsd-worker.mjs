import { parentPort, workerData } from 'node:worker_threads';
import bzip from 'seek-bzip';
import { parseHsd } from './himawari-hsd.mjs';
try {
  const output = Buffer.alloc(6200000);
  let offset = 0;
  bzip.decode(
    Buffer.from(workerData),
    {
      writeByte(value) {
        if (offset >= output.length) throw new Error('HSD exceeds limit');
        output[offset++] = value;
      },
    },
    true,
  );
  const result = parseHsd(output.subarray(0, offset));
  parentPort.postMessage({ result }, [result.pixels.buffer, result.temperatures.buffer]);
} catch {
  parentPort.postMessage({ error: 'Invalid compressed HSD segment' });
}
