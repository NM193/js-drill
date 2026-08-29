#!/usr/bin/env node
// js-drill - jedna lekcija i jedan zadatak po pokretanju.
// Claude Code (headless) generise, ntfy gura na telefon, GitHub Pages prikazuje.
// Resenje prethodnog zadatka stize uz sledecu notifikaciju, pa imas ceo dan.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { loadState, saveState, log } from './lib/state.mjs';
import { generateValidDrill, callClaude } from './lib/generate.mjs';
import { lessonPayload, taskPayload, solutionPayload, push, notifyMac } from './lib/publish.mjs';
import { writeDrill, commitAndPush } from './lib/repo.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.join(ROOT, 'docs');

const FORMATS = ['mcq', 'challenge', 'debug'];
const HISTORY_LIMIT = 25;

const NTFY_TOPIC = process.env.NTFY_TOPIC;
const SITE_URL = process.env.SITE_URL;

async function main() {
  if (!NTFY_TOPIC) throw new Error('NTFY_TOPIC nije postavljen');
  if (!SITE_URL) throw new Error('SITE_URL nije postavljen');

  const slot = process.argv[2] ?? (new Date().getHours() < 12 ? 'jutro' : 'vece');
  const state = await loadState(ROOT);
  const bank = await readFile(path.join(ROOT, 'bank.md'), 'utf8');

  if (state.pending) await push(solutionPayload(state.pending), NTFY_TOPIC);

  const format = FORMATS[state.runCount % FORMATS.length];
  const drill = await generateValidDrill({
    generator: (prompt) => callClaude(prompt, ROOT),
    format,
    bank,
    history: state.history,
  });

  drill.id = `${new Date().toISOString().slice(0, 10)}-${slot}`;
  drill.createdAt = new Date().toISOString();
  drill.slot = slot;

  // Repo pre notifikacija: "Resi" dugme vodi na stranicu koja mora da postoji.
  await writeDrill(DOCS, drill);
  await commitAndPush(ROOT, `drill: ${drill.id} - ${drill.topic}`)
    .catch((err) => log(ROOT, `UPOZORENJE - push nije uspeo: ${err.message}`));

  await push(lessonPayload(drill), NTFY_TOPIC);
  await push(taskPayload(drill, SITE_URL), NTFY_TOPIC);
  await notifyMac(`Zadatak: ${drill.task.title}`, drill.task.brief);

  // Tek posle uspesne isporuke - neuspeo run ne sme da pojede vezbu.
  state.pending = drill;
  state.runCount += 1;
  state.history = [...state.history, drill.topic].slice(-HISTORY_LIMIT);
  await saveState(ROOT, state);

  await log(ROOT, `${slot} ok - ${format} / ${drill.topic}`);
}

main().catch(async (err) => {
  await log(ROOT, `GRESKA - ${err.message}`);
  console.error(err);
  process.exitCode = 1;
});
