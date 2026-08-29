import { runInWorker } from './run-tests.mjs';

// Kapija protiv najgore greske u sistemu: da ti tacno resenje prijavljuje pad
// zato sto je model napisao netacan test. Vezba izlazi samo ako referentno
// resenje prodje sopstvene testove.
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
