import { test } from 'node:test';
import assert from 'node:assert';
import { verifyDrill } from '../lib/verify.mjs';

const drill = (answer) => ({
  task: { tests: [{ name: 'dupla dvojka', code: 'assert.equal(dupli(2), 4);' }] },
  answer,
});

test('tacno referentno resenje prolazi', async () => {
  const r = await verifyDrill(drill('function dupli(x) { return x * 2; }'));
  assert.equal(r.ok, true);
});

test('netacno referentno resenje pada sa razlogom', async () => {
  const r = await verifyDrill(drill('function dupli(x) { return x + 1; }'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /dupla dvojka/);
});
