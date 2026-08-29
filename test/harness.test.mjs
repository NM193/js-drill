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
