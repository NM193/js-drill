import { test } from 'node:test';
import assertNode from 'node:assert';
import { assert, AssertionError } from '../docs/harness.js';

test('equal prolazi na istim vrednostima', () => {
  assert.equal(1, 1);
});

test('equal pada na razlicitim vrednostima', () => {
  assertNode.throws(() => assert.equal(1, 2), AssertionError);
});

test('equal koristi Object.is - NaN je jednak NaN', () => {
  assert.equal(NaN, NaN);
});

test('deepEqual poredi ugnjezdene objekte', () => {
  assert.deepEqual({ a: { b: [1, 2] } }, { a: { b: [1, 2] } });
  assertNode.throws(() => assert.deepEqual({ a: 1 }, { a: 2 }), AssertionError);
});

test('throws hvata bacenu gresku', () => {
  assert.throws(() => { throw new Error('bum'); });
  assertNode.throws(() => assert.throws(() => {}), AssertionError);
});

import { runTests } from '../docs/harness.js';

test('runTests prijavljuje prolaz', () => {
  const r = runTests('function dupli(x) { return x * 2; }', [
    { name: 'dupla dvojka', code: 'assert.equal(dupli(2), 4);' },
  ]);
  assertNode.deepStrictEqual(r, [{ name: 'dupla dvojka', ok: true }]);
});

test('runTests prijavljuje pad sa porukom', () => {
  const r = runTests('function dupli(x) { return x + 1; }', [
    { name: 'dupla dvojka', code: 'assert.equal(dupli(2), 4);' },
  ]);
  assertNode.equal(r[0].ok, false);
  assertNode.match(r[0].message, /ocekivano 4/);
});

test('runTests hvata sintaksnu gresku u korisnickom kodu', () => {
  const r = runTests('function ( {{{', [{ name: 't', code: 'assert.ok(true);' }]);
  assertNode.equal(r[0].ok, false);
});

test('runTests nastavlja posle pada jednog testa', () => {
  const r = runTests('function f() { return 1; }', [
    { name: 'pada', code: 'assert.equal(f(), 2);' },
    { name: 'prolazi', code: 'assert.equal(f(), 1);' },
  ]);
  assertNode.equal(r.length, 2);
  assertNode.equal(r[1].ok, true);
});
