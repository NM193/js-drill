#!/usr/bin/env node
// js-drill - jedna mala JS vezba po pokretanju.
// Claude Code (headless) generise vezbu, ntfy je gura na telefon.
// Resenje prethodne vezbe stize uz sledecu notifikaciju, pa imas ceo dan da razmislis.

import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude';
const NTFY_TOPIC = process.env.NTFY_TOPIC;
const NTFY_SERVER = process.env.NTFY_SERVER ?? 'https://ntfy.sh';

const STATE_PATH = path.join(ROOT, 'state.json');
const BANK_PATH = path.join(ROOT, 'bank.md');
const LOG_PATH = path.join(ROOT, 'drill.log');

const FORMATS = ['mcq', 'challenge', 'debug'];
const HISTORY_LIMIT = 25;

const FORMAT_BRIEF = {
  mcq: 'Jedno pitanje sa tri ponudjena odgovora (A, B, C). Tacno jedan je tacan. Ponudjene odgovore ubaci u polje "question", svaki u svoj red.',
  challenge:
    'Mini zadatak: napisi funkciju u najvise 5 linija. U "question" navedi potpis funkcije i 2 primera ulaz -> izlaz.',
  debug:
    'Kratak snippet od 5 do 10 linija sa tacno jednim bagom. U "question" stavi kod i pitanje "sta je bag i zasto?".',
};

// --- state -----------------------------------------------------------------

const EMPTY_STATE = { runCount: 0, pending: null, history: [] };

async function loadState() {
  try {
    return { ...EMPTY_STATE, ...JSON.parse(await readFile(STATE_PATH, 'utf8')) };
  } catch {
    return { ...EMPTY_STATE };
  }
}

async function saveState(state) {
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function log(line) {
  await appendFile(LOG_PATH, `${new Date().toISOString()} ${line}\n`, 'utf8');
}

// --- generisanje -----------------------------------------------------------

// Claude ume da obmota JSON u markdown ogradu iako mu kazemo da ne treba.
function stripFences(text) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
}

function buildPrompt(format, bank, history) {
  return [
    'Ti si generator kratkih JavaScript vezbi.',
    'Odgovaras ISKLJUCIVO validnim JSON objektom - bez markdown ograda, bez uvoda, bez komentara.',
    '',
    `Format vezbe: ${format}. ${FORMAT_BRIEF[format]}`,
    '',
    'Pravila:',
    '- Vezba se resava za manje od 2 minuta.',
    '- Mora da bude zanimljiva i da otkriva nesto o tome kako JS stvarno radi, ne puko pamcenje sintakse.',
    '- Bez pitanja tipa "sta ispisuje ovaj namerno zamrsen kod".',
    '',
    'Profil korisnika i teme:',
    bank,
    '',
    `Vec obradjene teme, izbegni ih: ${history.length ? history.join(', ') : 'nema'}`,
    '',
    'Vrati tacno ovakav JSON:',
    '{"topic":"kratka oznaka teme, 1-3 reci","title":"naslov do 40 znakova","question":"tekst vezbe","answer":"tacan odgovor u 1-2 recenice","explanation":"objasnjenje, do 3 recenice"}',
  ].join('\n');
}

async function generateDrill(format, bank, history) {
  const { stdout } = await execFileAsync(
    CLAUDE_BIN,
    ['-p', buildPrompt(format, bank, history), '--output-format', 'json'],
    { cwd: ROOT, maxBuffer: 10 * 1024 * 1024, timeout: 120_000 },
  );

  const envelope = JSON.parse(stdout);
  if (envelope.is_error) throw new Error(`claude greska: ${envelope.result}`);

  const drill = JSON.parse(stripFences(envelope.result));
  for (const field of ['topic', 'title', 'question', 'answer', 'explanation']) {
    if (!drill[field]) throw new Error(`nedostaje polje "${field}" u odgovoru`);
  }
  return { ...drill, format };
}

// --- isporuka --------------------------------------------------------------

// JSON publishing umesto HTTP headera - headeri lome UTF-8, JSON body ne.
async function push({ title, message, tags, priority = 3 }) {
  if (!NTFY_TOPIC) throw new Error('NTFY_TOPIC nije postavljen');

  const res = await fetch(NTFY_SERVER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: NTFY_TOPIC, title, message, tags, priority }),
  });

  if (!res.ok) throw new Error(`ntfy ${res.status}: ${await res.text()}`);
}

// Bonus: ista notifikacija i na Mac-u, ako sedis za njim.
async function notifyMac(title, message) {
  if (process.platform !== 'darwin') return;
  const clean = (s) => s.replace(/["\\]/g, "'").replace(/\n/g, ' ').slice(0, 180);
  await execFileAsync('osascript', [
    '-e',
    `display notification "${clean(message)}" with title "${clean(title)}"`,
  ]).catch(() => {});
}

// --- main ------------------------------------------------------------------

async function main() {
  const slot = process.argv[2] ?? (new Date().getHours() < 12 ? 'jutro' : 'vece');
  const state = await loadState();
  const bank = await readFile(BANK_PATH, 'utf8');

  if (state.pending) {
    await push({
      title: `Resenje: ${state.pending.title}`,
      message: `${state.pending.answer}\n\n${state.pending.explanation}`,
      tags: ['white_check_mark'],
      priority: 2,
    });
  }

  const format = FORMATS[state.runCount % FORMATS.length];
  const drill = await generateDrill(format, bank, state.history);

  await push({
    title: `JS drill - ${drill.title}`,
    message: drill.question,
    tags: ['brain'],
    priority: 4,
  });
  await notifyMac(`JS drill - ${drill.title}`, drill.question);

  state.pending = drill;
  state.runCount += 1;
  state.history = [...state.history, drill.topic].slice(-HISTORY_LIMIT);
  await saveState(state);

  await log(`${slot} ok - ${format} / ${drill.topic}`);
}

main().catch(async (err) => {
  await log(`GRESKA - ${err.message}`);
  console.error(err);
  process.exitCode = 1;
});
