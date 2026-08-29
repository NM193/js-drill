const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

// Vraca listu gresaka umesto da baca, jer se sve salju nazad modelu odjednom pri
// regeneraciji - inace bi trebalo tri pokusaja da se saznaju tri problema.
export function validateDrill(drill) {
  const errors = [];
  const need = (condition, message) => {
    if (!condition) errors.push(message);
  };

  need(nonEmpty(drill?.topic), 'nedostaje "topic"');
  need(nonEmpty(drill?.answer), 'nedostaje "answer"');
  need(nonEmpty(drill?.explanation), 'nedostaje "explanation"');
  need(nonEmpty(drill?.lesson?.title), 'nedostaje "lesson.title"');
  need(nonEmpty(drill?.lesson?.body), 'nedostaje "lesson.body"');

  for (const field of ['title', 'brief', 'signature', 'starter']) {
    need(nonEmpty(drill?.task?.[field]), `nedostaje "task.${field}"`);
  }

  const tests = drill?.task?.tests;
  if (!Array.isArray(tests) || tests.length === 0) {
    errors.push('"task.tests" mora biti neprazan niz');
  } else {
    tests.forEach((testCase, i) => {
      need(nonEmpty(testCase?.name), `nedostaje "task.tests[${i}].name"`);
      need(nonEmpty(testCase?.code), `nedostaje "task.tests[${i}].code"`);
    });
  }

  return errors;
}
