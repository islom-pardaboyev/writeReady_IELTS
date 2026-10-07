/**
 * Offline checks for the writing record lookup (src/lib/writingTrace.ts).
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/test-writing-trace.ts
 *
 * A stand-in localStorage plays the browser.
 */

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
// Object.keys(localStorage) in a browser lists the stored keys; mirror that.
Object.defineProperty(globalThis, 'localStorage', {
  value: new Proxy((globalThis as { localStorage: object }).localStorage, {
    ownKeys: () => [...store.keys()],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  }),
});

const { essayFingerprint, traceFor, clearWritingTraces } = await import('../src/lib/writingTrace.js');

let failures = 0;
const check = (name: string, ok: boolean) => {
  if (ok) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}`); }
};

const ESSAY = 'Some people think that children should not use technology.\n\nI partly agree with this view.';
check('the fingerprint ignores spacing and line breaks', essayFingerprint(ESSAY) === essayFingerprint(`  ${ESSAY.replace(/\n\n/, ' ')}  `));
check('a different essay has a different fingerprint', essayFingerprint(ESSAY) !== essayFingerprint(ESSAY + ' Yes.'));
check('no record: null', traceFor(ESSAY) === null);

store.set('writeready.trace.live.mock.2', JSON.stringify({ v: 1, pasted: 40, activeMs: 125_400, last: Date.now(), hash: essayFingerprint(ESSAY), chars: 90 }));
const live = traceFor(ESSAY);
check('found in the answer box it was written in', live?.pastedChars === 40 && live.activeSeconds === 125 && live.chars === 90);

store.clear();
store.set('writeready.trace.done', JSON.stringify([{ hash: essayFingerprint(ESSAY), pasted: 500, activeMs: 3000, chars: 90, at: Date.now() }]));
const done = traceFor(ESSAY);
check('found among finished essays, pasted capped at the length', done?.pastedChars === 90 && done.activeSeconds === 3);

clearWritingTraces();
check('sign-out clears every record', traceFor(ESSAY) === null && store.size === 0);

console.log(failures ? `\n${failures} failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
