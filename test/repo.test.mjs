import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeDrill } from '../lib/repo.mjs';

const drill = (id, taskTitle) => ({
  id, topic: `T-${id}`, lesson: { title: `L-${id}` }, task: { title: taskTitle },
});

test('upisuje vezbu i azurira index, najnovija prva', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'drill-'));
  await writeDrill(dir, drill('a', 'Z'));
  await writeDrill(dir, drill('b', 'Y'));

  const idx = JSON.parse(await readFile(join(dir, 'drills/index.json'), 'utf8'));
  assert.equal(idx.length, 2);
  assert.equal(idx[0].id, 'b');
  assert.equal(idx[0].taskTitle, 'Y');
});

test('vezba se moze procitati nazad iz svog fajla', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'drill-'));
  await writeDrill(dir, drill('a', 'Z'));
  const back = JSON.parse(await readFile(join(dir, 'drills/a.json'), 'utf8'));
  assert.equal(back.task.title, 'Z');
});

test('ponovni upis istog id-a ne duplira index', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'drill-'));
  await writeDrill(dir, drill('a', 'Z'));
  await writeDrill(dir, drill('a', 'Z'));
  const idx = JSON.parse(await readFile(join(dir, 'drills/index.json'), 'utf8'));
  assert.equal(idx.length, 1);
});
