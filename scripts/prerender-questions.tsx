/**
 * Builds the public sample-answer pages into dist/, after `vite build`:
 *
 *   dist/questions/index.html                       the list
 *   dist/questions/<task>/<slug>/index.html         one page per question
 *   dist/question-data/...json                      the same data, for the app
 *   dist/question-images/<slug>.jpg                 each Task 1 chart, public for good
 *   dist/sitemap.xml                                public/sitemap.xml + every question
 *
 * It reads the published samples with the Admin SDK (FIREBASE_PROJECT_ID,
 * FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, which Vercel also gives the
 * build). Run by `npm run build`; on its own:
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/prerender-questions.tsx
 *
 * Without those variables (a local build) it writes an empty list and moves
 * on. In a production build a failure stops the deploy instead, so the live
 * site keeps its pages rather than losing them all. QUESTIONS_PRERENDER=skip
 * builds without them on purpose.
 */
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { Timestamp } from 'firebase-admin/firestore';
import { buildPages, renderSite, sitemapXml, type BuiltSite, type RawQuestion, type RawSample } from './lib/questionSite';
import type { QuestionTask } from '../src/lib/questionData';

const DIST = 'dist';
const production = process.env.VERCEL_ENV === 'production';

const asDate = (v: unknown): Date | null =>
  v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : typeof v === 'number' ? new Date(v) : null;
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);

async function load(): Promise<{ questions: RawQuestion[]; samples: RawSample[] }> {
  const { initFirebase } = await import('../api/_lib/shared.js');
  const { getFirestore } = await import('firebase-admin/firestore');
  initFirebase();
  const db = getFirestore();

  const snap = await db.collection('samples').where('status', '==', 'published').get();
  const samples: RawSample[] = snap.docs.map((d): RawSample => {
    const s = d.data();
    return {
      id: d.id,
      questionId: String(s.questionId ?? ''),
      slug: typeof s.slug === 'string' ? s.slug : '',
      taskType: s.taskType === 'task1' ? 'task1' : 'task2',
      sourceType: s.sourceType === 'student' ? 'student' : 'ai',
      band: Number(s.band) || 0,
      criteria: s.criteria && typeof s.criteria === 'object' ? s.criteria : null,
      mode: typeof s.mode === 'string' ? s.mode : undefined,
      sampleAnswer: typeof s.sampleAnswer === 'string' ? s.sampleAnswer : '',
      wordCount: Number(s.wordCount) || 0,
      outline: strings(s.outline),
      vocabulary: Array.isArray(s.vocabulary) ? s.vocabulary.filter((v: Record<string, unknown>) => v && v.word && v.uz) : [],
      grammarHighlights: strings(s.grammarHighlights),
      imageAlt: typeof s.imageAlt === 'string' ? s.imageAlt : undefined,
      sourceCredit: typeof s.sourceCredit === 'string' ? s.sourceCredit : undefined,
      publishedAt: asDate(s.publishedAt),
      updatedAt: asDate(s.pageChangedAt ?? s.publishedAt),
    };
  }).filter((s) => s.questionId);

  // Only the questions that have something to show, each read once.
  const ids = new Map<string, QuestionTask>();
  for (const s of samples) ids.set(s.questionId, s.taskType);
  const questions: RawQuestion[] = [];
  const entries = [...ids.entries()];
  for (let i = 0; i < entries.length; i += 100) {
    const part = entries.slice(i, i + 100);
    const [bank, metas, charts] = await Promise.all([
      db.getAll(...part.map(([id, t]) => db.collection(t === 'task1' ? 'task1_reports' : 'task2_reports').doc(id))),
      db.getAll(...part.map(([id]) => db.collection('questionMeta').doc(id))),
      Promise.all(part.map(([id, t]) => (t === 'task1' ? db.collection('task1_images').doc(id).get() : Promise.resolve(null)))),
    ]);
    part.forEach(([id, taskType], j) => {
      const text = bank[j].exists ? bank[j].get('report') : undefined;
      if (typeof text !== 'string' || !text.trim()) {
        console.warn(`prerender: question ${id} is no longer in the bank; its samples are not shown`);
        return;
      }
      const m = metas[j].exists ? metas[j].data() ?? {} : {};
      const chart = charts[j]?.exists ? charts[j]!.get('data') : null;
      questions.push({
        id,
        taskType,
        text,
        slug: typeof m.slug === 'string' ? m.slug : '',
        title: typeof m.title === 'string' ? m.title : '',
        topic: typeof m.topic === 'string' ? m.topic : '',
        chartType: typeof m.chartType === 'string' ? m.chartType : undefined,
        imageAlt: typeof m.imageAlt === 'string' ? m.imageAlt : undefined,
        chart: typeof chart === 'string' ? chart : null,
      });
    });
  }
  return { questions, samples };
}

async function write(path: string, content: string | Buffer): Promise<void> {
  const full = join(DIST, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

async function main(): Promise<void> {
  const template = await readFile(join(DIST, 'index.html'), 'utf8');
  const staticSitemap = await readFile('public/sitemap.xml', 'utf8');

  let site: BuiltSite;
  const haveCredentials = !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
  if (process.env.QUESTIONS_PRERENDER === 'skip' || !haveCredentials) {
    if (production && process.env.QUESTIONS_PRERENDER !== 'skip') {
      throw new Error('FIREBASE_* variables are missing in this production build, so the sample-answer pages cannot be built. Set QUESTIONS_PRERENDER=skip to deploy without them.');
    }
    console.warn('prerender: no Firebase credentials (or QUESTIONS_PRERENDER=skip); building an empty question list');
    site = buildPages([], []);
  } else {
    const { questions, samples } = await load();
    site = buildPages(questions, samples);
    for (const w of site.warnings) console.warn(`prerender: ${w}`);
  }

  const files = renderSite(template, site);
  for (const f of files) await write(f.path, f.content);
  await write('sitemap.xml', sitemapXml(staticSitemap, site));
  console.log(`prerender: ${site.pages.length} question pages, ${site.images.length} chart images, sitemap with ${site.pages.length + 1} new entries`);
}

main().then(
  // firebase-admin keeps sockets open; the build should not wait for them.
  () => process.exit(0),
  (e) => {
    console.error('prerender: failed:', e);
    process.exit(1);
  },
);
