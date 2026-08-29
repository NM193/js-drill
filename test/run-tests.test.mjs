import { test } from 'node:test';
import assert from 'node:assert';
import { runInWorker } from '../lib/run-tests.mjs';

test('vraca rezultate za ispravan kod', async () => {
  const r = await runInWorker('function f() { return 1; }', [
    { name: 'jedan', code: 'assert.equal(f(), 1);' },
  ]);
  assert.equal(r[0].ok, true);
});

test('beskonacna petlja se prekida timeout-om', async () => {
  const r = await runInWorker('function f() { while (true) {} }', [
    { name: 'visi', code: 'f();' },
  ], 300);
  assert.equal(r[0].ok, false);
  assert.match(r[0].message, /timeout/i);
});
