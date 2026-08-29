import { test } from 'node:test';
import assert from 'node:assert';
import { validateDrill } from '../lib/schema.mjs';
import { VALID_DRILL } from './fixtures.mjs';


test('validna vezba prolazi', () => {
  assert.deepEqual(validateDrill(VALID_DRILL), []);
});

test('nedostajuce polje se prijavljuje', () => {
  const { lesson, ...bez } = VALID_DRILL;
  assert.match(validateDrill(bez).join(' '), /lesson/);
});

test('prazan niz testova se prijavljuje', () => {
  const d = { ...VALID_DRILL, task: { ...VALID_DRILL.task, tests: [] } };
  assert.match(validateDrill(d).join(' '), /tests/);
});

test('test bez code polja se prijavljuje', () => {
  const d = { ...VALID_DRILL, task: { ...VALID_DRILL.task, tests: [{ name: 'x' }] } };
  assert.match(validateDrill(d).join(' '), /code/);
});

test('sve greske se vracaju odjednom', () => {
  assert.ok(validateDrill({}).length >= 5);
});
