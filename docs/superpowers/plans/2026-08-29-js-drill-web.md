# js-drill web: lekcija + izvršiv zadatak — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Svako pokretanje isporuči lekciju i zadatak koji rešavaš pisanjem koda na telefonu, sa testovima koji se stvarno izvršavaju; repo postaje trajna arhiva.

**Architecture:** Mac generiše vežbu preko `claude -p`, validira je pokretanjem referentnog rešenja protiv generisanih testova, commit-uje u GitHub repo i šalje dve ntfy notifikacije. Druga notifikacija ima `view` dugme koje otvara GitHub Pages stranicu; stranica izvršava tvoj kod u Web Worker-u protiv istih testova. Tok podataka je jednosmeran — Mac piše, telefon čita.

**Tech Stack:** Node 22+ (ESM, `node:test`, `node:worker_threads`), `claude -p --output-format json`, ntfy.sh, GitHub Pages (statično, bez build koraka), Web Workers. Bez ijedne npm zavisnosti.

**Spec:** `docs/superpowers/specs/2026-08-29-js-drill-web-design.md`

---

## Ograničenja utvrđena pre pisanja plana

Ovo nisu pretpostavke — svaka je izmerena.

| Ograničenje | Posledica | Rešenje u planu |
|---|---|---|
| `gh` token nema `admin:public_key` scope | Ne mogu da dodam SSH ključ na tvoj GitHub nalog | Deploy key po repou preko `repo` scope-a koji **imaš** (Task 13). Fallback: `gh auth refresh -h github.com -s admin:public_key`, koji traži tvoj browser |
| `git` nema credential helper ni SSH ključ | `git push` pukne pod launchd-om bez traga | Deploy key bez passphrase-a + `git@github.com` remote |
| `which node` vraća fnm multishell put vezan za PID | Plist bi pukao posle restarta | `/opt/homebrew/bin/node` (v25.5.0), već upisan u plist |
| ntfy.sh čuva poruke 12h | Vežba istekne tačno oko sledećeg termina | Vežbe žive u repou; ntfy nosi samo notifikaciju |
| Vercel i Figma MCP nisu autorizovani | Nedostupni u ovoj sesiji | Ne koriste se. Ako ikad zatrebaju, autorizacija ide kroz `claude mcp` u interaktivnom terminalu |

---

## File Structure

```
~/js-drill/
  drill.mjs               orkestracija: redosled koraka, ~70 linija
  lib/
    state.mjs             load/save state.json
    schema.mjs            validacija oblika vežbe
    generate.mjs          prompt, poziv claude-a, parsiranje
    run-tests.mjs         Node-strana: worker + timeout
    test-worker.mjs       Node worker entry
    verify.mjs            referentno rešenje protiv testova
    publish.mjs           ntfy payload-i + osascript
    repo.mjs              upis vežbe, index.json, commit, push
  test/
    *.test.mjs            node:test, jedan fajl po modulu
  docs/                   GitHub Pages root
    harness.js            assert + runTests — DELE Node i browser
    test-worker.js        browser worker entry
    index.html
    app.js
    style.css
    manifest.json
    .nojekyll
    drills/index.json
```

`docs/harness.js` je jedini fajl koji koriste obe strane. Time je zagarantovano
da testovi koji prođu na Mac-u prolaze i u browseru — da se logika duplira,
razišle bi se i self-validacija ne bi ništa značila.

---

## Task 1: Repo bootstrap

**Files:**
- Create: `.gitignore`, `docs/.nojekyll`
- Init: git repo u `~/js-drill`

- [ ] **Step 1: Inicijalizuj repo**

```bash
cd ~/js-drill
git init -b main
```

- [ ] **Step 2: Napiši .gitignore**

```
state.json
drill.log
launchd.out.log
launchd.err.log
.DS_Store
```

`state.json` sadrži `pending` sa rešenjem tekuće vežbe. Ostaje lokalno da ga ne
vidiš slučajno kroz repo pre nego što probaš.

- [ ] **Step 3: Napravi .nojekyll**

```bash
touch docs/.nojekyll
```

Bez ovoga GitHub Pages provlači sadržaj kroz Jekyll i ignoriše fajlove koji
počinju donjom crtom.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: init repo, ignore local state"
```

---

## Task 2: assert helper

**Files:**
- Create: `docs/harness.js`
- Test: `test/harness.test.mjs`

- [ ] **Step 1: Napiši testove koji padaju**

```js
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
```

- [ ] **Step 2: Pokreni, potvrdi pad**

Run: `node --test test/harness.test.mjs`
Expected: FAIL — `Cannot find module '../docs/harness.js'`

- [ ] **Step 3: Implementiraj**

```js
export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

const show = (v) => {
  try {
    return typeof v === 'string' ? JSON.stringify(v) : String(JSON.stringify(v) ?? v);
  } catch {
    return String(v);
  }
};

function deepEq(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && deepEq(a[k], b[k]));
}

export const assert = {
  ok(value, message) {
    if (!value) throw new AssertionError(message ?? `ocekivano istinito, dobijeno ${show(value)}`);
  },
  equal(actual, expected, message) {
    if (!Object.is(actual, expected)) {
      throw new AssertionError(message ?? `ocekivano ${show(expected)}, dobijeno ${show(actual)}`);
    }
  },
  deepEqual(actual, expected, message) {
    if (!deepEq(actual, expected)) {
      throw new AssertionError(message ?? `ocekivano ${show(expected)}, dobijeno ${show(actual)}`);
    }
  },
  throws(fn, message) {
    try {
      fn();
    } catch {
      return;
    }
    throw new AssertionError(message ?? 'ocekivana greska, nista nije baceno');
  },
};
```

`equal` namerno koristi `Object.is`, ne `===`. Tema `NaN` i `-0` je u `bank.md`,
pa bi `===` napravio testove koji lažu baš na temi koju vežbaš.

- [ ] **Step 4: Pokreni, potvrdi prolaz**

Run: `node --test test/harness.test.mjs`
Expected: PASS, 5 testova

- [ ] **Step 5: Commit**

```bash
git add docs/harness.js test/harness.test.mjs
git commit -m "feat: assert helper deljen izmedju Node-a i browsera"
```

---

## Task 3: runTests u harness-u

**Files:**
- Modify: `docs/harness.js`
- Test: `test/harness.test.mjs`

- [ ] **Step 1: Dopiši testove**

```js
import { runTests } from '../docs/harness.js';

test('runTests prijavljuje prolaz', () => {
  const r = runTests('function dupli(x) { return x * 2; }', [
    { name: 'dupla dvojka', code: 'assert.equal(dupli(2), 4);' },
  ]);
  assertNode.deepStrictEqual(r, [{ name: 'dupla dvojka', ok: true }]);
});

test('runTests prijavljuje pad sa porukom', () => {
  const r = runTests('function dupli(x) { return x + 2; }', [
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
```

- [ ] **Step 2: Pokreni, potvrdi pad**

Run: `node --test test/harness.test.mjs`
Expected: FAIL — `runTests is not a function`

- [ ] **Step 3: Implementiraj**

```js
export function runTests(userCode, tests) {
  return tests.map(({ name, code }) => {
    try {
      // eslint-disable-next-line no-new-func
      new Function('assert', `"use strict";\n${userCode}\n;${code}`)(assert);
      return { name, ok: true };
    } catch (err) {
      return { name, ok: false, message: err?.message ?? String(err) };
    }
  });
}
```

Svaki test dobija svež `new Function` scope, pa mutacija iz jednog ne curi u
sledeći. Sintaksna greška u korisničkom kodu pada pri konstrukciji i hvata se
istim `catch`-om.

- [ ] **Step 4: Pokreni, potvrdi prolaz**

Run: `node --test test/harness.test.mjs`
Expected: PASS, 9 testova

- [ ] **Step 5: Commit**

```bash
git add docs/harness.js test/harness.test.mjs
git commit -m "feat: runTests izvrsava korisnicki kod protiv test slucajeva"
```

---

## Task 4: Node runner sa timeout-om

**Files:**
- Create: `lib/test-worker.mjs`, `lib/run-tests.mjs`
- Test: `test/run-tests.test.mjs`

- [ ] **Step 1: Napiši testove koji padaju**

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { runInWorker } from '../lib/run-tests.mjs';

test('vraca rezultate za ispravan kod', async () => {
  const r = await runInWorker('function f() { return 1; }', [
    { name: 'jedan', code: 'assert.equal(f(), 1);' },
  ]);
  assert.equal(r[0].ok, true);
});

test('beskonacna petlja se prekida timeout-om', async () => {
  const r = await runInWorker('function f() { while (true) {} }', [
    { name: 'visi', code: 'f();' },
  ], 300);
  assert.equal(r[0].ok, false);
  assert.match(r[0].message, /timeout/i);
});
```

- [ ] **Step 2: Pokreni, potvrdi pad**

Run: `node --test test/run-tests.test.mjs`
Expected: FAIL — modul ne postoji

- [ ] **Step 3: Implementiraj worker**

`lib/test-worker.mjs`:

```js
import { parentPort, workerData } from 'node:worker_threads';
import { runTests } from '../docs/harness.js';

parentPort.postMessage(runTests(workerData.userCode, workerData.tests));
```

`lib/run-tests.mjs`:

```js
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const WORKER = fileURLToPath(new URL('./test-worker.mjs', import.meta.url));

export function runInWorker(userCode, tests, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER, { workerData: { userCode, tests } });
    const timer = setTimeout(() => {
      worker.terminate();
      resolve(tests.map(({ name }) => ({ name, ok: false, message: `timeout posle ${timeoutMs}ms` })));
    }, timeoutMs);

    worker.once('message', (results) => {
      clearTimeout(timer);
      resolve(results);
    });
    worker.once('error', (err) => {
      clearTimeout(timer);
      resolve(tests.map(({ name }) => ({ name, ok: false, message: err.message })));
    });
    worker.once('exit', () => clearTimeout(timer));
  });
}
```

Nikad ne odbacuje — greška je uvek rezultat testa, ne izuzetak. Time pozivalac
nema dve grane za istu stvar.

- [ ] **Step 4: Pokreni, potvrdi prolaz**

Run: `node --test test/run-tests.test.mjs`
Expected: PASS, 2 testa. Drugi traje ~300ms.

- [ ] **Step 5: Commit**

```bash
git add lib/test-worker.mjs lib/run-tests.mjs test/run-tests.test.mjs
git commit -m "feat: izvrsavanje testova u workeru sa timeout-om"
```

---

## Task 5: Validacija sheme

**Files:**
- Create: `lib/schema.mjs`
- Test: `test/schema.test.mjs`

- [ ] **Step 1: Napiši testove koji padaju**

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { validateDrill } from '../lib/schema.mjs';

const valid = {
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
  assert.deepEqual(validateDrill(valid), []);
});

test('nedostajuce polje se prijavljuje', () => {
  const { lesson, ...bez } = valid;
  assert.match(validateDrill(bez).join(' '), /lesson/);
});

test('prazan niz testova se prijavljuje', () => {
  const d = { ...valid, task: { ...valid.task, tests: [] } };
  assert.match(validateDrill(d).join(' '), /tests/);
});

test('test bez code polja se prijavljuje', () => {
  const d = { ...valid, task: { ...valid.task, tests: [{ name: 'x' }] } };
  assert.match(validateDrill(d).join(' '), /code/);
});
```

- [ ] **Step 2: Pokreni, potvrdi pad**

Run: `node --test test/schema.test.mjs`

- [ ] **Step 3: Implementiraj**

```js
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

export function validateDrill(drill) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  need(nonEmpty(drill?.topic), 'nedostaje "topic"');
  need(nonEmpty(drill?.answer), 'nedostaje "answer"');
  need(nonEmpty(drill?.explanation), 'nedostaje "explanation"');
  need(nonEmpty(drill?.lesson?.title), 'nedostaje "lesson.title"');
  need(nonEmpty(drill?.lesson?.body), 'nedostaje "lesson.body"');

  for (const f of ['title', 'brief', 'signature', 'starter']) {
    need(nonEmpty(drill?.task?.[f]), `nedostaje "task.${f}"`);
  }

  const tests = drill?.task?.tests;
  if (!Array.isArray(tests) || tests.length === 0) {
    errors.push('"task.tests" mora biti neprazan niz');
  } else {
    tests.forEach((t, i) => {
      need(nonEmpty(t?.name), `nedostaje "task.tests[${i}].name"`);
      need(nonEmpty(t?.code), `nedostaje "task.tests[${i}].code"`);
    });
  }

  return errors;
}
```

Vraća listu grešaka umesto da baca, jer se sve greške šalju nazad modelu
odjednom pri regeneraciji — inače bi trebalo tri pokušaja da se saznaju tri
problema.

- [ ] **Step 4: Pokreni, potvrdi prolaz** — `node --test test/schema.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add lib/schema.mjs test/schema.test.mjs
git commit -m "feat: validacija sheme vezbe"
```

---

## Task 6: Self-validacija (verify)

**Files:**
- Create: `lib/verify.mjs`
- Test: `test/verify.test.mjs`

- [ ] **Step 1: Napiši testove koji padaju**

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { verifyDrill } from '../lib/verify.mjs';

const drill = (answer) => ({
  task: { tests: [{ name: 'dupla dvojka', code: 'assert.equal(dupli(2), 4);' }] },
  answer,
});

test('tacno referentno resenje prolazi', async () => {
  const r = await verifyDrill(drill('function dupli(x) { return x * 2; }'));
  assert.equal(r.ok, true);
});

test('netacno referentno resenje pada sa razlogom', async () => {
  const r = await verifyDrill(drill('function dupli(x) { return x + 2; }'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /dupla dvojka/);
});
```

- [ ] **Step 2: Pokreni, potvrdi pad**

- [ ] **Step 3: Implementiraj**

```js
import { runInWorker } from './run-tests.mjs';

export async function verifyDrill(drill) {
  const results = await runInWorker(drill.answer, drill.task.tests);
  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) return { ok: true, results };
  return {
    ok: false,
    results,
    reason: failed.map((r) => `"${r.name}": ${r.message}`).join('; '),
  };
}
```

Ovo je kapija koja štiti od najgore greške u sistemu: da ti tačno rešenje
prijavljuje pad zato što je model napisao netačan test.

- [ ] **Step 4: Pokreni, potvrdi prolaz**

- [ ] **Step 5: Commit**

```bash
git add lib/verify.mjs test/verify.test.mjs
git commit -m "feat: referentno resenje se proverava protiv svojih testova"
```

---

## Task 7: Generisanje

**Files:**
- Create: `lib/generate.mjs`
- Test: `test/generate.test.mjs`
- Reference: `bank.md` ostaje nepromenjen

- [ ] **Step 1: Napiši testove za čiste funkcije**

Poziv modela se ne testira. Testira se parsiranje i sastavljanje prompta.

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { parseDrill, buildPrompt } from '../lib/generate.mjs';

test('parseDrill skida markdown ogradu', () => {
  const d = parseDrill('```json\n{"topic":"x"}\n```');
  assert.equal(d.topic, 'x');
});

test('parseDrill radi i bez ograde', () => {
  assert.equal(parseDrill('{"topic":"x"}').topic, 'x');
});

test('buildPrompt ubacuje format i istoriju', () => {
  const p = buildPrompt('challenge', 'BANKA', ['Closure', 'TDZ']);
  assert.match(p, /challenge/);
  assert.match(p, /BANKA/);
  assert.match(p, /Closure, TDZ/);
});

test('buildPrompt navodi greske iz prethodnog pokusaja', () => {
  const p = buildPrompt('mcq', 'B', [], ['nedostaje "topic"']);
  assert.match(p, /nedostaje "topic"/);
});
```

- [ ] **Step 2: Pokreni, potvrdi pad**

- [ ] **Step 3: Implementiraj**

```js
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude';

const FORMAT_BRIEF = {
  mcq: 'Zadatak je izbor izmedju tri ponudjene implementacije. U "task.starter" stavi tri varijante kao komentare A, B, C i praznu funkciju koju korisnik popunjava tackom varijantom.',
  challenge: 'Zadatak je pisanje funkcije u najvise 5 linija.',
  debug: 'U "task.starter" stavi kod od 5 do 10 linija sa tacno jednim bagom. Korisnik ga ispravlja.',
};

export function buildPrompt(format, bank, history, errors = []) {
  return [
    'Ti si generator kratkih JavaScript lekcija sa zadatkom.',
    'Odgovaras ISKLJUCIVO validnim JSON objektom - bez markdown ograda, bez uvoda.',
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
    '- Testovi pozivaju funkciju iz "task.signature" po imenu. Ne koriste import ni require.',
    '- "answer" mora biti pun kod koji prolazi SVE testove. Bice pokrenut i proveren.',
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
    JSON.stringify({
      topic: 'kratka oznaka teme, 1-3 reci',
      lesson: { title: 'naslov lekcije do 40 znakova', body: 'objasnjenje' },
      task: {
        title: 'naslov zadatka do 40 znakova',
        brief: 'sta treba uraditi',
        signature: 'function ime(arg)',
        starter: 'pocetni kod',
        tests: [{ name: 'opis testa', code: 'assert.equal(ime(1), 2);' }],
      },
      answer: 'pun kod resenja',
      explanation: 'objasnjenje do 3 recenice',
    }),
  ].join('\n');
}

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
```

- [ ] **Step 4: Pokreni, potvrdi prolaz**

- [ ] **Step 5: Commit**

```bash
git add lib/generate.mjs test/generate.test.mjs
git commit -m "feat: prompt sa lekcijom, zadatkom i test slucajevima"
```

---

## Task 8: Petlja generisanja sa retry-jem

**Files:**
- Modify: `lib/generate.mjs`
- Test: `test/generate.test.mjs`

- [ ] **Step 1: Napiši test sa lažnim generatorom**

```js
import { generateValidDrill } from '../lib/generate.mjs';

test('ponavlja dok vezba ne prodje validaciju', async () => {
  let calls = 0;
  const fake = async () => {
    calls += 1;
    return calls === 1
      ? { topic: 'x' }                       // nevalidna
      : structuredClone(VALID_DRILL);        // validna, iz fixture-a
  };
  const drill = await generateValidDrill({ generator: fake, format: 'challenge', bank: 'B', history: [] });
  assert.equal(calls, 2);
  assert.equal(drill.topic, VALID_DRILL.topic);
});

test('odustaje posle tri pokusaja', async () => {
  const fake = async () => ({ topic: 'x' });
  await assert.rejects(
    () => generateValidDrill({ generator: fake, format: 'mcq', bank: 'B', history: [] }),
    /tri pokusaja/,
  );
});
```

- [ ] **Step 2: Pokreni, potvrdi pad**

- [ ] **Step 3: Implementiraj**

```js
import { validateDrill } from './schema.mjs';
import { verifyDrill } from './verify.mjs';

const MAX_ATTEMPTS = 3;

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
```

Generator se ubrizgava, pa se petlja testira bez ijednog poziva modela.

- [ ] **Step 4: Pokreni, potvrdi prolaz**

- [ ] **Step 5: Commit**

```bash
git add lib/generate.mjs test/generate.test.mjs
git commit -m "feat: retry petlja sa vracanjem gresaka modelu"
```

---

## Task 9: state i publish moduli

**Files:**
- Create: `lib/state.mjs`, `lib/publish.mjs`
- Test: `test/publish.test.mjs`
- Reference: `drill.mjs:36-52` (state), `drill.mjs:106-126` (push) — kod se seli

- [ ] **Step 1: Napiši testove za sastavljanje payload-a**

```js
import { lessonPayload, taskPayload, solutionPayload } from '../lib/publish.mjs';

const drill = {
  id: '2026-08-29-jutro',
  lesson: { title: 'Closure', body: 'Telo lekcije.' },
  task: { title: 'Brojac', brief: 'Napravi brojac.' },
  answer: 'A', explanation: 'E',
};

test('lekcija ima prioritet 3 i nema action', () => {
  const p = lessonPayload(drill);
  assert.equal(p.priority, 3);
  assert.match(p.title, /Lekcija/);
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
```

- [ ] **Step 2: Pokreni, potvrdi pad**

- [ ] **Step 3: Implementiraj**

`lib/publish.mjs`:

```js
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const NTFY_SERVER = process.env.NTFY_SERVER ?? 'https://ntfy.sh';

export const lessonPayload = (d) => ({
  title: `Lekcija: ${d.lesson.title}`,
  message: d.lesson.body,
  tags: ['book'],
  priority: 3,
});

export const taskPayload = (d, siteUrl) => ({
  title: `Zadatak: ${d.task.title}`,
  message: d.task.brief,
  tags: ['brain'],
  priority: 4,
  actions: [{ action: 'view', label: 'Resi', url: `${siteUrl}?d=${d.id}`, clear: false }],
});

export const solutionPayload = (d) => ({
  title: `Resenje: ${d.task?.title ?? d.title}`,
  message: `${d.answer}\n\n${d.explanation}`,
  tags: ['white_check_mark'],
  priority: 2,
});

export async function push(payload, topic) {
  if (!topic) throw new Error('NTFY_TOPIC nije postavljen');
  const res = await fetch(NTFY_SERVER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, ...payload }),
  });
  if (!res.ok) throw new Error(`ntfy ${res.status}: ${await res.text()}`);
}

export async function notifyMac(title, message) {
  if (process.platform !== 'darwin') return;
  const clean = (s) => s.replace(/["\\]/g, "'").replace(/\n/g, ' ').slice(0, 180);
  await execFileAsync('osascript', [
    '-e', `display notification "${clean(message)}" with title "${clean(title)}"`,
  ]).catch(() => {});
}
```

`solutionPayload` čita `d.task?.title ?? d.title` — time stara `pending` vežba
iz prethodne sheme ne ruši prvi run posle migracije.

`lib/state.mjs` se prenosi iz `drill.mjs:36-52` bez izmena logike, samo kao modul.

- [ ] **Step 4: Pokreni, potvrdi prolaz**

- [ ] **Step 5: Commit**

```bash
git add lib/state.mjs lib/publish.mjs test/publish.test.mjs
git commit -m "refactor: state i publish u zasebne module"
```

---

## Task 10: Upis u repo

**Files:**
- Create: `lib/repo.mjs`
- Test: `test/repo.test.mjs`

- [ ] **Step 1: Napiši testove za upis (bez git-a)**

```js
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeDrill } from '../lib/repo.mjs';

test('upisuje vezbu i azurira index', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'drill-'));
  await writeDrill(dir, { id: 'a', topic: 'T', lesson: { title: 'L' }, task: { title: 'Z' } });
  await writeDrill(dir, { id: 'b', topic: 'U', lesson: { title: 'M' }, task: { title: 'Y' } });

  const idx = JSON.parse(await readFile(join(dir, 'drills/index.json'), 'utf8'));
  assert.equal(idx.length, 2);
  assert.equal(idx[0].id, 'b', 'najnovija je prva');
  assert.equal(idx[0].taskTitle, 'Y');
});

test('ponovni upis istog id-a ne duplira index', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'drill-'));
  const d = { id: 'a', topic: 'T', lesson: { title: 'L' }, task: { title: 'Z' } };
  await writeDrill(dir, d);
  await writeDrill(dir, d);
  const idx = JSON.parse(await readFile(join(dir, 'drills/index.json'), 'utf8'));
  assert.equal(idx.length, 1);
});
```

- [ ] **Step 2: Pokreni, potvrdi pad**

- [ ] **Step 3: Implementiraj**

```js
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export async function writeDrill(docsDir, drill) {
  const dir = path.join(docsDir, 'drills');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${drill.id}.json`), `${JSON.stringify(drill, null, 2)}\n`, 'utf8');

  const indexPath = path.join(dir, 'index.json');
  let index = [];
  try {
    index = JSON.parse(await readFile(indexPath, 'utf8'));
  } catch { /* prvi upis */ }

  const entry = {
    id: drill.id,
    topic: drill.topic,
    lessonTitle: drill.lesson.title,
    taskTitle: drill.task.title,
  };
  index = [entry, ...index.filter((e) => e.id !== drill.id)];
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

export async function commitAndPush(root, message) {
  await execFileAsync('git', ['add', 'docs/drills'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', message], { cwd: root });
  await execFileAsync('git', ['push', '--quiet'], { cwd: root });
}
```

- [ ] **Step 4: Pokreni, potvrdi prolaz**

- [ ] **Step 5: Commit**

```bash
git add lib/repo.mjs test/repo.test.mjs
git commit -m "feat: upis vezbe u repo i azuriranje indeksa"
```

---

## Task 11: Orkestracija u drill.mjs

**Files:**
- Rewrite: `drill.mjs`

- [ ] **Step 1: Napiši novi drill.mjs**

```js
#!/usr/bin/env node
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

const TOPIC = process.env.NTFY_TOPIC;
const SITE_URL = process.env.SITE_URL;

async function main() {
  if (!SITE_URL) throw new Error('SITE_URL nije postavljen');

  const slot = process.argv[2] ?? (new Date().getHours() < 12 ? 'jutro' : 'vece');
  const state = await loadState(ROOT);
  const bank = await readFile(path.join(ROOT, 'bank.md'), 'utf8');

  if (state.pending) await push(solutionPayload(state.pending), TOPIC);

  const format = FORMATS[state.runCount % FORMATS.length];
  const drill = await generateValidDrill({
    generator: (prompt) => callClaude(prompt, ROOT),
    format, bank, history: state.history,
  });

  drill.id = `${new Date().toISOString().slice(0, 10)}-${slot}`;
  drill.createdAt = new Date().toISOString();
  drill.slot = slot;

  await writeDrill(DOCS, drill);
  await commitAndPush(ROOT, `drill: ${drill.id} - ${drill.topic}`)
    .catch((err) => log(ROOT, `UPOZORENJE - push nije uspeo: ${err.message}`));

  await push(lessonPayload(drill), TOPIC);
  await push(taskPayload(drill, SITE_URL), TOPIC);
  await notifyMac(`Zadatak: ${drill.task.title}`, drill.task.brief);

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
```

Redosled je nameran: repo pre notifikacija, jer `view` dugme vodi na stranicu
koja mora da postoji. `saveState` je poslednji, da neuspeo run ne pojede vežbu.
Push je jedina operacija čiji neuspeh ne prekida run.

- [ ] **Step 2: Pokreni sve testove**

Run: `node --test test/`
Expected: PASS, svi

- [ ] **Step 3: Commit**

```bash
git add drill.mjs
git commit -m "refactor: drill.mjs kao orkestracija nad modulima"
```

---

## Task 12: Stranica

**Files:**
- Create: `docs/index.html`, `docs/app.js`, `docs/style.css`, `docs/test-worker.js`, `docs/manifest.json`

- [ ] **Step 1: Browser worker**

`docs/test-worker.js`:

```js
import { runTests } from './harness.js';
self.onmessage = (e) => self.postMessage(runTests(e.data.userCode, e.data.tests));
```

- [ ] **Step 2: index.html**

Struktura: `<main>` sa sekcijama `#lesson`, `#task`, `<textarea id="editor">`,
dugme `#run`, `<ul id="results">`, i `<details>` sa rešenjem. Bez zavisnosti.
`<meta name="viewport" content="width=device-width, initial-scale=1">` i
`<link rel="manifest" href="manifest.json">`.

Editor mora imati `spellcheck="false" autocapitalize="off" autocorrect="off"` —
bez toga Android kapitalizuje svaku liniju koda.

- [ ] **Step 3: app.js**

Ključna logika:

```js
const params = new URLSearchParams(location.search);
const id = params.get('d');

if (!id) renderArchive();
else renderDrill(id);

async function renderDrill(id) {
  const res = await fetch(`drills/${id}.json`);
  if (!res.ok) return showMessage('Ta vezba jos nije objavljena.');
  const drill = await res.json();
  // popuni lekciju, zadatak, editor iz localStorage[`code:${id}`] ?? drill.task.starter
}

function runUserCode(userCode, tests) {
  return new Promise((resolve) => {
    const worker = new Worker('test-worker.js', { type: 'module' });
    const timer = setTimeout(() => {
      worker.terminate();
      resolve(tests.map(({ name }) => ({ name, ok: false, message: 'timeout posle 2000ms' })));
    }, 2000);
    worker.onmessage = (e) => { clearTimeout(timer); worker.terminate(); resolve(e.data); };
  });
}
```

Isti oblik kao `lib/run-tests.mjs`, isti `harness.js` ispod. Kod se snima u
`localStorage` na svaki `input`, pa zatvaranje taba ne gubi rad.

- [ ] **Step 4: Ručna provera u browseru**

```bash
cd ~/js-drill/docs && python3 -m http.server 8000
```

Otvori `http://localhost:8000/?d=<id>` i proveri tri slučaja:
tačno rešenje → svi testovi zeleni; netačno → crveno sa porukom;
`while(true){}` → timeout posle 2s, stranica se ne zamrzne.

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "feat: stranica sa editorom i izvrsavanjem testova"
```

---

## Task 13: Deploy key, Pages, raspored

**Files:**
- Modify: `com.jsdrill.agent.plist`
- Create: SSH ključ `~/.ssh/js-drill-deploy`

- [ ] **Step 1: Napravi repo i uključi Pages**

```bash
cd ~/js-drill
gh repo create js-drill --private --source=. --remote=origin --push
```

Pages na privatnom repou traži GitHub Pro. Ako ga nemaš, koristi `--public` —
JS vežbe nisu osetljive.

- [ ] **Step 2: Deploy key umesto naloga**

`gh` token nema `admin:public_key`, pa ključ ne može na nalog. Deploy key po
repou radi sa `repo` scope-om koji imaš:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/js-drill-deploy -N "" -C "js-drill launchd"
gh api -X POST repos/NM193/js-drill/keys \
  -f title='js-drill launchd' -f key="$(cat ~/.ssh/js-drill-deploy.pub)" -F read_only=false
git remote set-url origin git@github.com:NM193/js-drill.git
```

Ako i ovo vrati 404, fallback je `gh auth refresh -h github.com -s admin:public_key`,
koji otvara browser i traži tvoju potvrdu — to ne mogu ja da uradim.

- [ ] **Step 3: Poveži ključ sa git-om**

Dodaj u `~/.ssh/config`:

```
Host github.com
  IdentityFile ~/.ssh/js-drill-deploy
  IdentitiesOnly yes
```

Provera: `ssh -T git@github.com` → očekivano `Hi NM193/js-drill! You've successfully authenticated`.

- [ ] **Step 4: Dopuni plist**

Dodaj `SITE_URL` u `EnvironmentVariables`:

```xml
<key>SITE_URL</key>
<string>https://nm193.github.io/js-drill/</string>
```

- [ ] **Step 5: End-to-end u launchd okruženju**

```bash
cd ~/js-drill && env -i HOME=$HOME PATH=/opt/homebrew/bin:/usr/bin:/bin \
  CLAUDE_BIN=$HOME/.local/bin/claude \
  NTFY_TOPIC=<TVOJ-TOPIC> \
  SITE_URL=https://nm193.github.io/js-drill/ \
  /opt/homebrew/bin/node drill.mjs
```

`env -i` briše okruženje — ako prođe ovde, proći će i pod launchd-om. Očekivano:
tri notifikacije (rešenje stare vežbe, lekcija, zadatak), novi commit, i vežba
dostupna na sajtu.

- [ ] **Step 6: Uključi raspored**

```bash
cp ~/js-drill/com.jsdrill.agent.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.jsdrill.agent.plist
launchctl list | grep jsdrill
```

- [ ] **Step 7: Commit**

```bash
git add com.jsdrill.agent.plist README.md
git commit -m "chore: SITE_URL u plistu, uputstvo za deploy key"
```

---

## Redosled i zavisnosti

Taskovi 2→3→4 grade harness odozdo naviše i moraju tim redom. Task 5 (schema) je
nezavisan i može paralelno. Task 6 zavisi od 4. Taskovi 7→8 zavise od 5 i 6.
Task 12 (stranica) zavisi samo od 2 i 3, pa može rano. Task 13 je poslednji jer
traži da sve radi.

## Šta ostaje nepromenjeno

`bank.md` se ne dira — profil i teme rade kako treba. `com.jsdrill.agent.plist`
dobija samo jednu promenljivu. Termini 08:00 i 20:00 ostaju.
