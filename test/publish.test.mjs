import { test } from 'node:test';
import assert from 'node:assert';
import { lessonPayload, taskPayload, solutionPayload } from '../lib/publish.mjs';

const drill = {
  id: '2026-08-29-jutro',
  lesson: { title: 'Closure', body: 'Telo lekcije.' },
  task: { title: 'Brojac', brief: 'Napravi brojac.' },
  answer: 'A',
  explanation: 'E',
};

test('lekcija ima prioritet 3 i nema action', () => {
  const p = lessonPayload(drill);
  assert.equal(p.priority, 3);
  assert.match(p.title, /^Lekcija: /);
  assert.equal(p.actions, undefined);
});

test('zadatak ima view action ka stranici sa id-em', () => {
  const p = taskPayload(drill, 'https://nm193.github.io/js-drill/');
  assert.equal(p.priority, 4);
  assert.equal(p.actions[0].action, 'view');
  assert.match(p.actions[0].url, /\?d=2026-08-29-jutro$/);
});

test('resenje ima prioritet 2', () => {
  assert.equal(solutionPayload(drill).priority, 2);
});

test('resenje radi i za staru shemu bez task polja', () => {
  const stara = { title: 'Stari naslov', answer: 'A', explanation: 'E' };
  assert.match(solutionPayload(stara).title, /Stari naslov/);
});
