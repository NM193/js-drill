import { parentPort, workerData } from 'node:worker_threads';
import { runTests } from '../docs/harness.js';

parentPort.postMessage(runTests(workerData.userCode, workerData.tests));
