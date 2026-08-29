export const VALID_DRILL = {
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
