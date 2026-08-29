import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const WORKER = fileURLToPath(new URL('./test-worker.mjs', import.meta.url));

// Nikad ne odbacuje - greska je uvek rezultat testa, ne izuzetak. Time pozivalac
// nema dve grane za istu stvar.
export function runInWorker(userCode, tests, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER, { workerData: { userCode, tests } });
    let settled = false;

    const finish = (results) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(results);
    };

    const timer = setTimeout(
      () => finish(tests.map(({ name }) => ({ name, ok: false, message: `timeout posle ${timeoutMs}ms` }))),
      timeoutMs,
    );

    worker.once('message', finish);
    worker.once('error', (err) => finish(
      tests.map(({ name }) => ({ name, ok: false, message: err.message })),
    ));
    worker.once('exit', () => finish(
      tests.map(({ name }) => ({ name, ok: false, message: 'worker je zavrsio bez rezultata' })),
    ));
  });
}
