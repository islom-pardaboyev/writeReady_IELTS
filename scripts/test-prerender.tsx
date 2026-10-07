/**
 * Offline checks for the sample-answer pages the build writes
 * (scripts/lib/questionSite.tsx): head tags, structured data, the chart image,
 * the embedded data, related questions and the sitemap.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/test-prerender.tsx
 *
 * Uses dist/index.html when a build is there (run `npm run build` first for
 * the real template), else a minimal stand-in. `--write` also writes the
 * fixture pages into dist/ to look at them with `vite preview`.
 */
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { buildPages, decodeChart, imageSize, notFoundHtml, pageHtml, renderSite, sitemapXml, type RawQuestion, type RawSample } from './lib/questionSite';
import { EMBEDDED_DATA_ID, pageDescription, pageTitle, titleCase } from '../src/lib/questionData';

let failures = 0;
let passes = 0;
function check(name: string, ok: unknown, detail?: unknown): void {
  if (ok) passes++;
  else {
    failures++;
    console.error(`✗ ${name}${detail !== undefined ? `\n    ${typeof detail === 'string' ? detail.slice(0, 600) : JSON.stringify(detail).slice(0, 600)}` : ''}`);
  }
}

const template = existsSync('dist/index.html')
  ? await readFile('dist/index.html', 'utf8')
  : `<!doctype html><html lang="en"><head><title>WriteReady</title><meta name="description" content="Home" /><link rel="canonical" href="https://writeready.uz" /><meta property="og:title" content="x" /><meta name="twitter:card" content="x" /><script type="application/ld+json">{}</script></head><body><div id="root"><div id="wr-splash"><span>loading</span></div><script>x()</script></div></body></html>`;
const staticSitemap = await readFile('public/sitemap.xml', 'utf8');

// A 1400x900 PNG header and an 800x500 JPEG header: enough for the size reader.
function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}
function jpeg(width: number, height: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const dqt = Buffer.from([0xff, 0xdb, 0x00, 0x04, 0x00, 0x00]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, dqt, sof, Buffer.from([0xff, 0xd9])]);
}
check('PNG size', JSON.stringify(imageSize(png(1400, 900))) === '{"width":1400,"height":900}');
check('JPEG size, past other segments', imageSize(jpeg(800, 500))?.width === 800 && imageSize(jpeg(800, 500))?.height === 500, imageSize(jpeg(800, 500)));
check('unknown bytes give no size', imageSize(Buffer.from('hello world, not an image')) === null);
check('PDF chart decodes as pdf', decodeChart(`data:application/pdf;base64,${Buffer.from('%PDF-1.4').toString('base64')}`)?.ext === 'pdf');

const para = (n: number, w = 'word') => Array.from({ length: n }, (_, i) => `${w}${i % 9}`).join(' ');
const essay = `${para(60)}.\n\n${para(70)}.\n\n${para(70)}.\n\n${para(60)}.`;
const vocab = Array.from({ length: 9 }, (_, i) => ({ word: `collocation ${i}`, meaning: 'what it means', uz: `ma'nosi ${i}`, example: `An example sentence ${i}.` }));
const day = (d: string) => new Date(`${d}T10:00:00Z`);

const questions: RawQuestion[] = [
  { id: 'q1', taskType: 'task1', text: 'The line graph below shows energy consumption in the USA from 1980 to 2030.\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.', slug: 'line-graph-energy-consumption', title: 'Energy consumption in the USA', topic: 'Energy', chartType: 'Line graph', imageAlt: 'Line graph showing energy consumption in the USA from 1980 to 2030', chart: `data:image/png;base64,${png(1400, 900).toString('base64')}` },
  { id: 'q2', taskType: 'task2', text: 'Some people think children should not use technology at school. To what extent do you agree or disagree? <script>alert(1)</script>', slug: 'children-and-technology', title: 'Children and technology', topic: 'Education', chart: null },
  { id: 'q3', taskType: 'task2', text: 'Should university education be free? Discuss both views.', slug: 'free-university-education', title: 'Free university education', topic: 'Education', chart: null },
  { id: 'q4', taskType: 'task2', text: 'Cities are growing. Problems and solutions.', slug: 'growing-cities', title: 'Growing cities', topic: 'Cities & Housing', chart: null },
  { id: 'q5', taskType: 'task1', text: 'The process diagram shows how bricks are made.', slug: 'process-brick-making', title: 'Brick making', topic: 'Other', chartType: 'Process', chart: null },
  { id: 'q6', taskType: 'task2', text: 'A question nobody answered.', slug: 'unanswered', title: 'Unanswered', topic: 'Society', chart: null },
  { id: 'cq_own1', taskType: 'task2', custom: true, text: 'Some students prefer studying alone. Others prefer groups. Discuss both views.', slug: 'studying-alone-or-in-groups', title: 'Studying alone or in groups', topic: 'Education', chart: null },
];
const sample = (o: Partial<RawSample> & Pick<RawSample, 'id' | 'questionId' | 'taskType'>): RawSample => ({
  slug: '', sourceType: 'ai', band: 8, criteria: null, sampleAnswer: essay, wordCount: 260, outline: ['Introduction', 'Body 1', 'Body 2', 'Conclusion'],
  vocabulary: vocab, grammarHighlights: ['Concession with although.', 'Relative clauses.', 'Conditionals.'],
  sourceCredit: 'CDI_Report / Tushgan_Writing', publishedAt: day('2026-10-01'), updatedAt: day('2026-10-02'), ...o,
});
const samples: RawSample[] = [
  sample({ id: 's1', questionId: 'q1', taskType: 'task1', wordCount: 180 }),
  sample({ id: 's2', questionId: 'q2', taskType: 'task2', sourceType: 'student', band: 7.5, mode: 'mock', criteria: { taskScore: 7, cc: 8, lr: 7.5, gra: 7 }, outline: [], vocabulary: vocab.slice(0, 2), grammarHighlights: [], publishedAt: day('2026-10-03'), updatedAt: day('2026-10-05') }),
  sample({ id: 's3', questionId: 'q2', taskType: 'task2' }),
  sample({ id: 's4', questionId: 'q3', taskType: 'task2', band: 8.5 }),
  sample({ id: 's5', questionId: 'q4', taskType: 'task2', band: 7 }),
  sample({ id: 's6', questionId: 'q5', taskType: 'task1', sourceType: 'student', band: 7, mode: 'relax', criteria: { taskScore: 7, cc: 7, lr: 7, gra: 7 } }),
  sample({ id: 's7', questionId: 'q-gone', taskType: 'task2' }),
  sample({ id: 's8', questionId: 'cq_own1', taskType: 'task2', sourceType: 'student', band: 7.5, mode: 'relax', criteria: { taskScore: 7.5, cc: 7.5, lr: 7.5, gra: 7 }, sourceCredit: undefined }),
];

const site = buildPages(questions, samples, day('2026-10-06'));
check('one page per question with a published sample', site.pages.length === 6, site.pages.map((p) => p.slug));
check('a question with no sample gets no page', !site.pages.some((p) => p.slug === 'unanswered'));
const q2 = site.pages.find((p) => p.slug === 'children-and-technology')!;
check('student answer comes first, then the model answer', q2.samples.map((s) => s.sourceType).join() === 'student,ai');
check('student criteria kept, AI criteria never shown', !!q2.samples[0].criteria && q2.samples[1].criteria === null);
check('notes come from the reviewed AI answer', q2.outline.length === 4 && q2.vocabulary.length === 9 && q2.grammarHighlights.length === 3);
check('dates: first published, last changed', q2.publishedAt.startsWith('2026-10-01') && q2.updatedAt.startsWith('2026-10-05'), [q2.publishedAt, q2.updatedAt]);
check('related: same task, same topic first', q2.related[0]?.slug === 'free-university-education' && q2.related.every((r) => r.taskType === 'task2' && r.slug !== q2.slug), q2.related);
const q1 = site.pages.find((p) => p.slug === 'line-graph-energy-consumption')!;
check('Task 1 chart written to question-images with its size', q1.image?.src === '/question-images/line-graph-energy-consumption.png' && q1.image.width === 1400 && q1.image.height === 900 && site.images.some((i) => i.path === 'question-images/line-graph-energy-consumption.png'));
check('Task 1 alt text from the question metadata', q1.image?.alt === 'Line graph showing energy consumption in the USA from 1980 to 2030');
check('Task 1 without a chart: page without an image, and a warning', site.pages.find((p) => p.slug === 'process-brick-making')?.image === null && site.warnings.some((w) => w.includes('process-brick-making')));
check('titles', pageTitle(q1) === 'IELTS Writing Task 1: Line Graph — Energy Consumption in the USA — Band 8 Sample Answer' && pageTitle(q2) === 'IELTS Writing Task 2: Children and Technology — Band 8 Sample Answer', [pageTitle(q1), pageTitle(q2)]);
check('description under 160 characters', pageDescription(q2).length <= 160 && pageDescription(q2).includes('a real student answer and a model answer'), pageDescription(q2));
check('title case keeps acronyms', titleCase('energy use in the USA and UK') === 'Energy Use in the USA and UK');
check('index lists every page', site.index.questions.length === 6 && site.index.topics.at(-1) === 'Other');
const ownPage = site.pages.find((p) => p.slug === 'studying-alone-or-in-groups')!;
check('a student\'s own question gets a page, marked custom', !!ownPage && ownPage.custom === true && ownPage.sourceCredit === undefined);

const files = renderSite(template, site);
const file = (path: string) => String(files.find((f) => f.path === path)?.content ?? '');
const html1 = file('questions/task1/line-graph-energy-consumption/index.html');
const html2 = file('questions/task2/children-and-technology/index.html');
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
check('page files written', !!html1 && !!html2 && !!file('questions/index.html') && !!file('question-data/index.json') && !!file('question-data/task2/children-and-technology.json'));
check('exactly one <title>', count(html1, /<title>/g) === 1);
check('unique page title', html1.includes('<title>IELTS Writing Task 1: Line Graph — Energy Consumption in the USA — Band 8 Sample Answer</title>'));
check('one description, one canonical (www)', count(html1, /name="description"/g) === 1 && count(html1, /rel="canonical"/g) === 1 && html1.includes('<link rel="canonical" href="https://www.writeready.uz/questions/task1/line-graph-energy-consumption" />'));
check('no home-page Open Graph left behind', count(html1, /property="og:title"/g) === 1 && !html1.includes('og-image.jpg'));
check('og:image is the chart for Task 1', html1.includes('<meta property="og:image" content="https://www.writeready.uz/question-images/line-graph-energy-consumption.png" />') && html1.includes('og:image:width" content="1400"'));
check('Task 2 og:image is the site card', html2.includes('og:image" content="https://www.writeready.uz/og-image.jpg"'));
check('the chart is preloaded with high priority', html1.includes('<link rel="preload" as="image" href="/question-images/line-graph-energy-consumption.png" fetchpriority="high" />'));
const ld = [...html1.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const article = ld.find((x) => x['@type'] === 'Article');
check('Article JSON-LD with the chart image', !!article && article.image[0] === 'https://www.writeready.uz/question-images/line-graph-energy-consumption.png' && article.datePublished && article.publisher.logo.url.endsWith('/logo.png'), article);
check('Breadcrumb JSON-LD', ld.some((x) => x['@type'] === 'BreadcrumbList'));
check('the organisation JSON-LD of the home page is not duplicated', !ld.some((x) => x['@type'] === 'EducationalOrganization'));
// React separates neighbouring text with <!-- --> in server HTML.
const text = (html: string) => html.replace(/<!-- -->/g, '');
check('the page content is in the HTML', text(html1).includes('Energy Consumption in the USA: Band 8 sample answer') && text(html1).includes('Model answer — Band <span'));
check('chart image tag: eager, sized, with alt', /<img src="\/question-images\/line-graph-energy-consumption\.png" alt="Line graph showing energy consumption in the USA from 1980 to 2030" width="1400" height="900" loading="eager" fetchPriority="high"/i.test(html1), html1.match(/<img src="\/question-images[^>]*>/)?.[0]);
check('the call to action opens Quick Write with this question', html1.includes('href="/writing/quick?task=1&amp;q=q1"') && html1.includes('Write your own answer and get your band score'));
check('the source credit is shown', html1.includes('Question source:') && html1.includes('https://t.me/CDI_Report'));
const htmlOwn = file('questions/task2/studying-alone-or-in-groups/index.html');
check('own question: "Write your own answer" opens Relax with it', htmlOwn.includes('href="/writing/relax?from=task2/studying-alone-or-in-groups"'));
check('own question: no partner source credit', !htmlOwn.includes('Question source:'));
check('Student answer label', text(html2).includes('Student answer — Band') && text(html2).includes('Written by a WriteReady student in Mock exam, shared anonymously'));
check('vocabulary has Uzbek', html2.includes('lang="uz"'));
check('the loading logo is gone, the app script stays', !html1.includes('wr-splash') && /<script type="module"[^>]*src="\/(assets|src)\//.test(html1));
check('question text is escaped, never run', !html2.includes('<script>alert(1)</script>') && html2.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
const embedded = html2.match(new RegExp(`<script id="${EMBEDDED_DATA_ID}" type="application/json">([\\s\\S]*?)</script>`))?.[1] ?? '';
check('embedded data cannot close its script tag', !embedded.includes('</script') && embedded.includes('\\u003cscript>'));
check('embedded data parses and matches the path', JSON.parse(embedded).path === '/questions/task2/children-and-technology' && JSON.parse(embedded).data.slug === 'children-and-technology');
const index = file('questions/index.html');
check('index page: title, canonical, every link', index.includes('<title>IELTS Writing Sample Answers (Band 7+) — Task 1 and Task 2 | WriteReady</title>') && index.includes('href="https://www.writeready.uz/questions"') && site.pages.every((p) => index.includes(`href="/questions/${p.taskType}/${p.slug}"`)));
check('pageHtml refuses a template without #root', (() => { try { pageHtml('<html><head></head><body></body></html>', { title: 't', description: 'd', path: '/x', type: 'website', image: { url: 'u', width: 1, height: 1, alt: 'a' }, jsonLd: [], embedded: {} }, ''); return false; } catch { return true; } })());

const xml = sitemapXml(staticSitemap, site);
check('sitemap keeps the site pages, on www', xml.includes('<loc>https://www.writeready.uz/pricing</loc>') && !xml.includes('https://writeready.uz/'));
check('sitemap lists /questions and every page', xml.includes('<loc>https://www.writeready.uz/questions</loc>') && site.pages.every((p) => xml.includes(`/questions/${p.taskType}/${p.slug}</loc>`)));
check('sitemap has the chart as an image entry', xml.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"') && xml.includes('<image:loc>https://www.writeready.uz/question-images/line-graph-energy-consumption.png</image:loc>'));
check('sitemap lastmod from the page', xml.includes('<lastmod>2026-10-05</lastmod>'));
const notFound = notFoundHtml(template);
check('404 page is the app, kept out of search results', notFound.includes('<div id="root">') && count(notFound, /name="robots"/g) === 1 && notFound.includes('<meta name="robots" content="noindex" />'));
const empty = buildPages([], []);
check('no samples: an empty list page still builds', renderSite(template, empty).some((f) => f.path === 'questions/index.html') && sitemapXml(staticSitemap, empty).includes('/questions</loc>'));

if (process.argv.includes('--write')) {
  // A real picture for the chart, so the page can be looked at in a browser.
  const real = existsSync('public/og-image.jpg') ? `data:image/jpeg;base64,${(await readFile('public/og-image.jpg')).toString('base64')}` : null;
  const looks = real ? renderSite(template, buildPages(questions.map((q) => (q.id === 'q1' ? { ...q, chart: real } : q)), samples, day('2026-10-06'))) : files;
  for (const f of looks) {
    const full = join('dist', f.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, f.content);
  }
  console.log('wrote the fixture pages into dist/');
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
