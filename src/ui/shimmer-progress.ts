import { Worker } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const PHASE_NAMES: Record<string, string> = {
  scanning: 'Scanning files',
  parsing: 'Parsing code',
  storing: 'Storing data',
  resolving: 'Resolving refs',
};

export interface IndexProgress {
  phase: string;
  current: number;
  total: number;
}

export interface ShimmerProgress {
  onProgress: (progress: IndexProgress) => void;
  stop: () => Promise<void>;
}

export function createShimmerProgress(): ShimmerProgress {
  let lastPhase = '';

  // In compiled mode, worker code is embedded as a string constant.
  // Write it to a temp file and pass the path to Worker.
  // In dev mode, resolve from __dirname (Bun resolves .js → .ts).
  let worker: Worker;
  if (process.env.CODEGRAPH_COMPILED === '1') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SHIMMER_WORKER_CODE } = require('../extraction/worker-code') as { SHIMMER_WORKER_CODE: string };
    const tmpFile = path.join(os.tmpdir(), `codegraph-shimmer-${Date.now()}.js`);
    fs.writeFileSync(tmpFile, SHIMMER_WORKER_CODE);
    worker = new Worker(tmpFile, { workerData: { startTime: Date.now() } });
    worker.on('exit', () => { fs.unlinkSync(tmpFile); });
  } else {
    worker = new Worker(path.join(__dirname, 'shimmer-worker.js'), {
      workerData: { startTime: Date.now() },
    });
  }

  return {
    onProgress(progress: IndexProgress) {
      const phaseName = PHASE_NAMES[progress.phase] || progress.phase;

      if (progress.phase !== lastPhase && lastPhase) {
        worker.postMessage({ type: 'finish-phase' });
      }
      lastPhase = progress.phase;

      let percent = -1;
      let count = 0;
      if (progress.total > 0) {
        percent = Math.round((progress.current / progress.total) * 100);
      } else if (progress.current > 0) {
        count = progress.current;
      }

      worker.postMessage({
        type: 'update',
        phase: progress.phase,
        phaseName,
        percent,
        count,
      });
    },

    stop() {
      return new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          worker.terminate().then(() => resolve());
        }, 2000);

        worker.on('message', (msg: { type: string }) => {
          if (msg.type === 'stopped') {
            clearTimeout(timeout);
            worker.terminate().then(() => resolve());
          }
        });

        worker.postMessage({ type: 'stop' });
      });
    },
  };
}
