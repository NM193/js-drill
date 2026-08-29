import { test } from 'node:test';
import assert from 'node:assert';
import { validateDrill } from '../lib/schema.mjs';

export const VALID_DRILL = {
  topic: 'Closure',
  lesson: { title: 'Closure', body: 'Objasnjenje.' },
  task: {
    title: 'Brojac',
    brief: 'Napravi brojac.',
    signature: 'function counter()',
    starter: 'function counter() {}',
    tests: [{ name: 'broji', code: 'assert.ok(true);' }],
  },
  answer: 'function counter() { let n = 0; return () => ++n; }',
  explanation: 'Closure cuva n.',
};

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
