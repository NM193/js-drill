import { runTests } from './harness.js';

self.onmessage = (e) => self.postMessage({ results: runTests(e.data.userCode, e.data.tests) });

// Javlja se cim su moduli ucitani, da roditelj ne meri mrezu kao da je tvoj kod.
self.postMessage({ ready: true });
