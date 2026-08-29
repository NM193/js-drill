import { test } from 'node:test';
import assert from 'node:assert';
import { parseDrill, buildPrompt } from '../lib/generate.mjs';

test('parseDrill skida markdown ogradu', () => {
  assert.equal(parseDrill('```json\n{"topic":"x"}\n```').topic, 'x');
});

test('parseDrill radi i bez ograde', () => {
  assert.equal(parseDrill('{"topic":"x"}').topic, 'x');
});

test('buildPrompt ubacuje format, banku i istoriju', () => {
  const p = buildPrompt('challenge', 'BANKA', ['Closure', 'TDZ']);
  assert.match(p, /challenge/);
  assert.match(p, /BANKA/);
  assert.match(p, /Closure, TDZ/);
});

test('buildPrompt bez istorije kaze nema', () => {
  assert.match(buildPrompt('mcq', 'B', []), /izbegni ih: nema/);
});

test('buildPrompt navodi greske iz prethodnog pokusaja', () => {
  const p = buildPrompt('mcq', 'B', [], ['nedostaje "topic"']);
  assert.match(p, /nedostaje "topic"/);
});

import { generateValidDrill } from '../lib/generate.mjs';
import { VALID_DRILL } from './fixtures.mjs';

test('ponavlja dok vezba ne prodje validaciju', async () => {
  let calls = 0;
  const fake = async () => {
    calls += 1;
    return calls === 1 ? { topic: 'x' } : structuredClone(VALID_DRILL);
  };
  const drill = await generateValidDrill({ generator: fake, format: 'challenge', bank: 'B', history: [] });
  assert.equal(calls, 2);
  assert.equal(drill.format, 'challenge');
});

test('ponavlja i kad referentno resenje padne na svojim testovima', async () => {
  let calls = 0;
  const fake = async () => {
    calls += 1;
    const d = structuredClone(VALID_DRILL);
    if (calls === 1) {
      d.task.tests = [{ name: 'nemoguc', code: 'assert.equal(1, 2);' }];
      d.answer = 'function counter() {}';
    }
    return d;
  };
  await generateValidDrill({ generator: fake, format: 'mcq', bank: 'B', history: [] });
  assert.equal(calls, 2);
});

test('odustaje posle tri pokusaja', async () => {
  const fake = async () => ({ topic: 'x' });
  await assert.rejects(
    () => generateValidDrill({ generator: fake, format: 'mcq', bank: 'B', history: [] }),
    /tri pokusaja/,
  );
});
