import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { validateDrill } from './schema.mjs';
import { verifyDrill } from './verify.mjs';

const execFileAsync = promisify(execFile);
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude';
const MAX_ATTEMPTS = 3;

const FORMAT_BRIEF = {
  mcq: 'Zadatak je izbor izmedju tri ponudjene implementacije. U "task.starter" stavi tri varijante kao komentare A, B i C, pa praznu funkciju koju korisnik popunjava onom koju smatra tacnom.',
  challenge: 'Zadatak je pisanje funkcije u najvise 5 linija.',
  debug: 'U "task.starter" stavi kod od 5 do 10 linija sa tacno jednim bagom. Korisnik ga ispravlja.',
};

const SHAPE = {
  topic: 'kratka oznaka teme, 1-3 reci',
  lesson: { title: 'naslov lekcije do 40 znakova', body: 'objasnjenje koncepta' },
  task: {
    title: 'naslov zadatka do 40 znakova',
    brief: 'sta treba uraditi',
    signature: 'function ime(arg)',
    starter: 'pocetni kod',
    tests: [{ name: 'opis testa', code: 'assert.equal(ime(1), 2);' }],
  },
  answer: 'pun kod resenja',
  explanation: 'objasnjenje do 3 recenice',
};

export function buildPrompt(format, bank, history, errors = []) {
  return [
    'Ti si generator kratkih JavaScript lekcija sa zadatkom.',
    'Odgovaras ISKLJUCIVO validnim JSON objektom - bez markdown ograda, bez uvoda, bez komentara.',
    '',
    `Format zadatka: ${format}. ${FORMAT_BRIEF[format]}`,
    '',
    'Struktura je uvek ista: prvo lekcija koja objasni koncept, pa zadatak koji proverava da li je shvacen.',
    '',
    'Pravila:',
    '- "lesson.body": 4 do 8 recenica. Sta je koncept, kako se pise, kako se gradi, gde puca. Markdown dozvoljen.',
    '- Zadatak se resava za manje od 5 minuta, na telefonu.',
    '- "task.tests" mora imati 2 do 4 testa. Svaki je JS isecak koji koristi globalni `assert`.',
    '- Dostupni matcheri: assert.ok, assert.equal, assert.deepEqual, assert.throws. Nista drugo.',
    '- assert.equal koristi Object.is, ne ===.',
    '- Testovi pozivaju funkciju iz "task.signature" po imenu. Bez import-a i bez require-a.',
    '- "answer" mora biti pun kod koji prolazi SVE testove. Bice stvarno pokrenut i proveren.',
    '- Bez pitanja tipa "sta ispisuje ovaj namerno zamrsen kod".',
    '',
    'Profil korisnika i teme:',
    bank,
    '',
    `Vec obradjene teme, izbegni ih: ${history.length ? history.join(', ') : 'nema'}`,
    ...(errors.length
      ? ['', 'Prethodni pokusaj je odbijen zbog sledecih gresaka. Ispravi ih:', ...errors.map((e) => `- ${e}`)]
      : []),
    '',
    'Vrati tacno ovakav JSON:',
    JSON.stringify(SHAPE),
  ].join('\n');
}

// Claude ume da obmota JSON u markdown ogradu iako mu kazemo da ne treba.
export function parseDrill(text) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(clean);
}

export async function callClaude(prompt, cwd) {
  const { stdout } = await execFileAsync(
    CLAUDE_BIN,
    ['-p', prompt, '--output-format', 'json'],
    { cwd, maxBuffer: 10 * 1024 * 1024, timeout: 120_000 },
  );

  const envelope = JSON.parse(stdout);
  if (envelope.is_error) throw new Error(`claude greska: ${envelope.result}`);
  return parseDrill(envelope.result);
}

// Generator se ubrizgava, pa se petlja testira bez ijednog poziva modela.
export async function generateValidDrill({ generator, format, bank, history }) {
  let errors = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const drill = await generator(buildPrompt(format, bank, history, errors));

    errors = validateDrill(drill);
    if (errors.length === 0) {
      const check = await verifyDrill(drill);
      if (check.ok) return { ...drill, format };
      errors = [`referentno resenje pada na svojim testovima: ${check.reason}`];
    }
  }

  throw new Error(`vezba nije prosla validaciju ni posle tri pokusaja: ${errors.join('; ')}`);
}
