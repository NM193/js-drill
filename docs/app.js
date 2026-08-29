const app = document.getElementById('app');
const TIMEOUT_MS = 2000;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

// Dovoljno markdowna za lekciju: pasusi, `kod`, **podebljano**.
function md(text) {
  return esc(text)
    .split(/\n{2,}/)
    .map((block) => {
      const html = block
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
      return `<p>${html}</p>`;
    })
    .join('');
}

function when(drill) {
  const date = new Date(drill.createdAt ?? Date.now());
  const day = new Intl.DateTimeFormat('sr-Latn-RS', { weekday: 'long' }).format(date);
  const dm = new Intl.DateTimeFormat('sr-Latn-RS', { day: '2-digit', month: '2-digit' }).format(date);
  return `${day} · ${dm} · ${drill.slot ?? ''}`.trim();
}

function note(message) {
  app.innerHTML = `<p class="note">${esc(message)}</p>`;
}

// --- resavanje -------------------------------------------------------------

function renderDrill(drill) {
  const key = `code:${drill.id}`;
  const saved = (() => {
    try { return localStorage.getItem(key); } catch { return null; }
  })();

  app.innerHTML = `
    <section class="lesson">
      <p class="eyebrow">${esc(when(drill))}</p>
      <h1>${esc(drill.lesson.title)}</h1>
      ${md(drill.lesson.body)}
    </section>

    <section class="console">
      <p class="eyebrow">Zadatak</p>
      <h2>${esc(drill.task.title)}</h2>
      <p class="brief">${esc(drill.task.brief)}</p>
      <p class="signature">${esc(drill.task.signature)}</p>

      <textarea id="editor" spellcheck="false" autocapitalize="none"
        autocorrect="off" autocomplete="off" aria-label="Tvoj kod"></textarea>

      <div class="bar">
        <button id="run" type="button">Pokreni</button>
        <span id="status" role="status"></span>
      </div>

      <ul id="results"></ul>

      <details>
        <summary>Rešenje</summary>
        <pre><code>${esc(drill.answer)}</code></pre>
        <p class="explanation">${esc(drill.explanation)}</p>
      </details>
    </section>
  `;

  const editor = document.getElementById('editor');
  editor.value = saved ?? drill.task.starter;

  editor.addEventListener('input', () => {
    try { localStorage.setItem(key, editor.value); } catch { /* privatni rezim */ }
  });

  // Tab uvlaci umesto da napusti polje.
  editor.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const { selectionStart: a, selectionEnd: b, value } = editor;
    editor.value = `${value.slice(0, a)}  ${value.slice(b)}`;
    editor.selectionStart = editor.selectionEnd = a + 2;
  });

  paint(drill.task.tests.map(({ name }) => ({ name })), false);
  spawnWorker();
  document.getElementById('run').addEventListener('click', () => run(drill, editor));
}

function paint(results, done) {
  const list = document.getElementById('results');
  list.innerHTML = results.map((r) => {
    const state = !done ? '' : r.ok ? 'pass' : 'fail';
    const mark = !done ? '○' : r.ok ? '✓' : '✗';
    const why = done && !r.ok ? `<span class="why">${esc(r.message)}</span>` : '';
    return `<li class="${state}"><span class="mark">${mark}</span><span>${esc(r.name)}</span>${why}</li>`;
  }).join('');

  if (!done) return;

  // Redovi sleću jedan po jedan - kao pravi runner, ne kao gotova tabela.
  const rows = [...list.children];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  rows.forEach((row, i) => setTimeout(() => row.classList.add('done'), reduce ? 0 : i * 70));
}

function run(drill, editor) {
  const button = document.getElementById('run');
  const status = document.getElementById('status');

  button.disabled = true;
  status.textContent = 'Pokrećem…';

  runInWorker(editor.value, drill.task.tests).then((results) => {
    const passed = results.filter((r) => r.ok).length;
    paint(results, true);
    status.textContent = `Prošlo ${passed} od ${results.length}`;
    button.disabled = false;
  });
}

// Worker se pravi unapred i ceka spreman. Timeout tako meri tvoj kod, a ne
// ucitavanje modula preko mreze - inace bi prvi pokusaj na telefonu uvek pao.
let worker = null;
let ready = null;

function spawnWorker() {
  worker = new Worker('test-worker.js', { type: 'module' });
  ready = new Promise((resolve) => {
    const onReady = (e) => {
      if (!e.data?.ready) return;
      worker.removeEventListener('message', onReady);
      resolve(true);
    };
    worker.addEventListener('message', onReady);
    worker.addEventListener('error', () => resolve(false));
  });
}

async function runInWorker(userCode, tests) {
  if (!worker) spawnWorker();
  const alive = await ready;

  const bail = (message) => tests.map(({ name }) => ({ name, ok: false, message }));
  if (!alive) return bail('ne mogu da pokrenem izvrsavanje');

  return new Promise((resolve) => {
    let settled = false;

    const finish = (results) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(results);
    };

    const timer = setTimeout(() => {
      // Petlja se ne da prekinuti iznutra - worker se ubija i pravi novi.
      worker.terminate();
      spawnWorker();
      finish(bail(`timeout posle ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    worker.addEventListener('message', function onDone(e) {
      if (!e.data?.results) return;
      worker.removeEventListener('message', onDone);
      finish(e.data.results);
    });

    worker.postMessage({ userCode, tests });
  });
}

// --- arhiva ----------------------------------------------------------------

function renderArchive(index) {
  if (index.length === 0) return note('Još nema nijedne vežbe.');

  app.innerHTML = `
    <section class="archive">
      <h1>Sve vežbe</h1>
      <ol>
        ${index.map((e) => `
          <li>
            <a href="?d=${encodeURIComponent(e.id)}">
              <span class="when">${esc(e.id)}</span>
              <span class="what">
                <strong>${esc(e.lessonTitle)}</strong>
                <span>${esc(e.taskTitle)}</span>
              </span>
            </a>
          </li>
        `).join('')}
      </ol>
    </section>
  `;
}

// --- start -----------------------------------------------------------------

const id = new URLSearchParams(location.search).get('d');

if (id) {
  fetch(`drills/${encodeURIComponent(id)}.json`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error('nema'))))
    .then(renderDrill)
    .catch(() => note('Ta vežba još nije objavljena.'));
} else {
  fetch('drills/index.json')
    .then((res) => (res.ok ? res.json() : []))
    .then(renderArchive)
    .catch(() => note('Još nema nijedne vežbe.'));
}
