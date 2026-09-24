/**
 * Offline checks for the prompt cache (src/lib/promptCache.ts).
 *
 *   npx tsx scripts/test-prompt-cache.ts
 *
 * No database: a stand-in source counts how often the prompts would be
 * downloaded, and a stand-in localStorage plays the browser.
 */

const store = new Map<string, string>();
let storageBroken = false;
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => { if (storageBroken) throw new Error('blocked'); return store.get(k) ?? null; },
  setItem: (k: string, v: string) => { if (storageBroken) throw new Error('blocked'); store.set(k, v); },
};

const { loadPromptsFrom } = await import('../src/lib/promptCache.js');

let failures = 0;
const check = (name: string, ok: boolean) => {
  if (ok) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}`); }
};

const LISTS = { task1: [{ id: 'a', report: 'Chart question' }], task2: [{ id: 'b', report: 'Essay question' }] };
let downloads = 0;
let version: string | null | undefined = '100';
let fetchFails = false;
const source = {
  version: async () => version,
  fetchAll: async () => { if (fetchFails) throw new Error('quota'); downloads++; return LISTS; },
};
const DAY = 24 * 60 * 60 * 1000;
const age = (ms: number) => {
  const saved = JSON.parse(store.get('writeready.prompts.v1')!);
  store.set('writeready.prompts.v1', JSON.stringify({ ...saved, savedAt: Date.now() - ms }));
};

console.log('\nPrompt cache');
const first = await loadPromptsFrom(source);
check('the first visit downloads the prompts', downloads === 1 && first.task2[0].report === 'Essay question');
await loadPromptsFrom(source);
check('a repeat visit with the same version downloads nothing', downloads === 1);
version = '200';
await loadPromptsFrom(source);
check('after the admin changes a prompt, the next visit downloads again', downloads === 2);
age(8 * DAY);
await loadPromptsFrom(source);
check('a copy older than a week is replaced even when the version matches', downloads === 3);

version = null;
store.clear();
await loadPromptsFrom(source);
await loadPromptsFrom(source);
check('with no version set yet, a saved copy is used for a day', downloads === 4);
age(DAY + 1000);
await loadPromptsFrom(source);
check('and replaced after that day', downloads === 5);

version = undefined;
await loadPromptsFrom(source);
check('when the version cannot be read, a recent copy is used', downloads === 5);

version = '300';
fetchFails = true;
const offline = await loadPromptsFrom(source);
check('when downloading fails, the saved copy still fills the page', offline.task1.length === 1);
store.clear();
let threw = false;
try { await loadPromptsFrom(source); } catch { threw = true; }
check('with nothing saved and no connection, the error reaches the page', threw);
fetchFails = false;

store.set('writeready.prompts.v1', '{not json');
await loadPromptsFrom(source);
check('a damaged saved copy is ignored and replaced', downloads === 6 && JSON.parse(store.get('writeready.prompts.v1')!).version === '300');

storageBroken = true;
const noStorage = await loadPromptsFrom(source);
check('with storage blocked (private window), the page still gets its prompts', noStorage.task2.length === 1 && downloads === 7);
storageBroken = false;

const saved = JSON.parse(store.get('writeready.prompts.v1')!);
check('only the id and the question are kept', Object.keys(saved.task1[0]).sort().join(',') === 'id,report');

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
