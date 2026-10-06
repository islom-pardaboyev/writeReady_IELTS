/**
 * Builds the public sample-answer pages from the published samples. Pure: it
 * takes plain data and returns files, so scripts/test-prerender.ts can check
 * it without a database. scripts/prerender-questions.tsx does the reading and
 * writing.
 */
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { QuestionsShell } from '../../src/components/questions/QuestionsShell';
import { QuestionView } from '../../src/components/questions/QuestionView';
import { QuestionList } from '../../src/components/questions/QuestionList';
import {
  EMBEDDED_DATA_ID, SITE_URL, excerptOf, fmtBand, pageDescription, pageTitle, questionDataPath, questionPath, taskLabel, titleCase,
  type PublicSample, type PublicVocab, type QuestionImage, type QuestionIndexData, type QuestionPageData, type QuestionSummary, type QuestionTask,
} from '../../src/lib/questionData';

export interface RawSample {
  id: string;
  questionId: string;
  slug: string;
  taskType: QuestionTask;
  sourceType: 'student' | 'ai';
  band: number;
  criteria: PublicSample['criteria'];
  mode?: string;
  sampleAnswer: string;
  wordCount: number;
  outline: string[];
  vocabulary: PublicVocab[];
  grammarHighlights: string[];
  imageAlt?: string;
  sourceCredit?: string;
  publishedAt: Date | null;
  updatedAt: Date | null;
}

export interface RawQuestion {
  id: string;
  taskType: QuestionTask;
  text: string;
  slug: string;
  title: string;
  topic: string;
  chartType?: string;
  imageAlt?: string;
  /** The stored chart, a data URL (src/lib/task1Chart.ts). */
  chart: string | null;
}

export interface OutFile {
  /** Relative to dist/. */
  path: string;
  content: string | Buffer;
}

export const INDEX_TITLE = 'IELTS Writing Sample Answers (Band 7+) — Task 1 and Task 2 | WriteReady';
export const INDEX_DESCRIPTION =
  'Band 7+ IELTS Writing Task 1 and Task 2 sample answers to real exam questions, with outlines, vocabulary in Uzbek and grammar notes.';
const DEFAULT_OG = { url: `${SITE_URL}/og-image.jpg`, width: 1200, height: 630, alt: 'WriteReady IELTS — practice IELTS Writing with instant AI feedback.' };

// ── Images ───────────────────────────────────────────────────────────────────

/** Width and height of a JPEG or PNG, read from its header. Null when it cannot tell. */
export function imageSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const length = bytes.readUInt16BE(i + 2);
      // Start-of-frame markers carry the size; C4, C8 and CC are other tables.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
      }
      i += 2 + length;
    }
  }
  return null;
}

export function decodeChart(dataUrl: string | null): { bytes: Buffer; ext: 'jpg' | 'png' | 'pdf' } | null {
  const m = dataUrl ? /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/is.exec(dataUrl.trim()) : null;
  if (!m) return null;
  const type = m[1].toLowerCase();
  const ext = type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : type === 'image/jpeg' || type === 'image/jpg' ? 'jpg' : null;
  return ext ? { bytes: Buffer.from(m[2], 'base64'), ext } : null;
}

// ── Pages ────────────────────────────────────────────────────────────────────

const latest = (dates: (Date | null)[]) => new Date(Math.max(0, ...dates.map((d) => d?.getTime() ?? 0)));
const earliest = (dates: (Date | null)[]) => {
  const times = dates.map((d) => d?.getTime() ?? 0).filter(Boolean);
  return new Date(times.length ? Math.min(...times) : Date.now());
};

function summaryOf(p: QuestionPageData): QuestionSummary {
  return {
    slug: p.slug,
    taskType: p.taskType,
    title: p.title,
    topic: p.topic,
    ...(p.chartType ? { chartType: p.chartType } : {}),
    excerpt: excerptOf(p.questionText),
    bestBand: Math.max(...p.samples.map((s) => s.band)),
    sampleCount: p.samples.length,
    hasStudentSample: p.samples.some((s) => s.sourceType === 'student'),
  };
}

/** 3 to 5 others of the same task: same topic first, then (Task 1) the same chart type, then the rest. */
function relatedTo(p: QuestionPageData, all: QuestionSummary[]): QuestionSummary[] {
  const others = all.filter((q) => q.taskType === p.taskType && q.slug !== p.slug);
  const rank = (q: QuestionSummary) => (q.topic === p.topic ? 0 : p.chartType && q.chartType === p.chartType ? 1 : 2);
  return others
    .sort((a, b) => rank(a) - rank(b) || b.bestBand - a.bestBand || a.slug.localeCompare(b.slug))
    .slice(0, 5);
}

export interface BuiltSite {
  pages: QuestionPageData[];
  index: QuestionIndexData;
  images: OutFile[];
  warnings: string[];
}

export function buildPages(questions: RawQuestion[], samples: RawSample[], now = new Date()): BuiltSite {
  const warnings: string[] = [];
  const byQuestion = new Map<string, RawSample[]>();
  for (const s of samples) {
    if (!s.sampleAnswer.trim()) continue;
    byQuestion.set(s.questionId, [...(byQuestion.get(s.questionId) ?? []), s]);
  }
  const pages: QuestionPageData[] = [];
  const images: OutFile[] = [];
  const seenSlugs = new Set<string>();
  for (const q of questions) {
    const own = byQuestion.get(q.id);
    if (!own?.length) continue;
    const slug = q.slug || own.find((s) => s.slug)?.slug || '';
    if (!/^[a-z0-9-]{1,80}$/.test(slug) || seenSlugs.has(`${q.taskType}/${slug}`)) {
      warnings.push(`question ${q.id} has published samples but no usable slug yet; skipped until it gets one`);
      continue;
    }
    seenSlugs.add(`${q.taskType}/${slug}`);
    // Student answers first, then model answers; the best band first within each.
    const ordered = [...own].sort((a, b) =>
      (a.sourceType === b.sourceType ? 0 : a.sourceType === 'student' ? -1 : 1) || b.band - a.band || a.id.localeCompare(b.id));
    // The reviewed AI answer carries the fullest notes; a student answer's are used when there is no AI one.
    const notesFrom = (pick: (s: RawSample) => unknown[]) =>
      [...own].sort((a, b) => (a.sourceType === 'ai' ? -1 : 1) - (b.sourceType === 'ai' ? -1 : 1) || pick(b).length - pick(a).length)
        .find((s) => pick(s).length > 0);

    let image: QuestionImage | null = null;
    if (q.taskType === 'task1') {
      const chart = decodeChart(q.chart);
      if (chart) {
        const file = `question-images/${slug}.${chart.ext}`;
        images.push({ path: file, content: chart.bytes });
        const size = chart.ext === 'pdf' ? null : imageSize(chart.bytes);
        if (chart.ext !== 'pdf' && !size) warnings.push(`could not read the size of ${file}; using 1200x800`);
        const alt = q.imageAlt || own.find((s) => s.imageAlt)?.imageAlt
          || `${q.chartType ?? 'Chart'} for the IELTS Writing Task 1 question: ${titleCase(q.title || 'sample question').toLowerCase()}`;
        image = { src: `/${file}`, kind: chart.ext === 'pdf' ? 'pdf' : 'image', width: size?.width ?? 1200, height: size?.height ?? 800, alt };
      } else {
        warnings.push(`Task 1 question ${q.id} (${slug}) has no readable chart; its page has no image`);
      }
    }

    pages.push({
      questionId: q.id,
      slug,
      taskType: q.taskType,
      title: q.title || excerptOf(q.text, 60),
      topic: q.topic || 'Other',
      ...(q.taskType === 'task1' && q.chartType ? { chartType: q.chartType } : {}),
      questionText: q.text,
      image,
      samples: ordered.map((s) => ({
        id: s.id,
        sourceType: s.sourceType,
        band: s.band,
        criteria: s.sourceType === 'student' ? s.criteria : null,
        ...(s.sourceType === 'student' && s.mode ? { mode: s.mode } : {}),
        sampleAnswer: s.sampleAnswer.trim(),
        wordCount: s.wordCount,
      })),
      outline: notesFrom((s) => s.outline)?.outline ?? [],
      vocabulary: notesFrom((s) => s.vocabulary)?.vocabulary ?? [],
      grammarHighlights: notesFrom((s) => s.grammarHighlights)?.grammarHighlights ?? [],
      related: [],
      ...(own.some((s) => s.sourceCredit) ? { sourceCredit: own.find((s) => s.sourceCredit)!.sourceCredit } : {}),
      publishedAt: earliest(own.map((s) => s.publishedAt)).toISOString(),
      updatedAt: latest(own.map((s) => s.updatedAt ?? s.publishedAt)).toISOString(),
    });
  }

  const summaries = pages.map(summaryOf).sort((a, b) =>
    a.taskType.localeCompare(b.taskType) || b.bestBand - a.bestBand || a.title.localeCompare(b.title));
  for (const p of pages) p.related = relatedTo(p, summaries);
  const topics = [...new Set(summaries.map((s) => s.topic))].sort((a, b) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)));
  return { pages, index: { questions: summaries, topics, generatedAt: now.toISOString() }, images, warnings };
}

// ── HTML ─────────────────────────────────────────────────────────────────────

const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** JSON inside a <script>: nothing in it can close the tag. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

interface Head {
  title: string;
  description: string;
  path: string;
  type: 'article' | 'website';
  image: { url: string; width: number; height: number; alt: string };
  jsonLd: unknown[];
  preloadImage?: string;
  embedded: unknown;
}

/**
 * The built index.html with this page's head and content. The site's own
 * title, description, canonical, Open Graph, Twitter and JSON-LD tags are
 * replaced, never duplicated; everything else (styles, scripts, the theme
 * script) stays as Vite built it.
 */
export function pageHtml(template: string, head: Head, appHtml: string): string {
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name="(?:description|keywords)"[\s\S]*?\/?>/gi, '')
    .replace(/<link\s+rel="canonical"[\s\S]*?\/?>/gi, '')
    .replace(/<meta\s+property="og:[^"]*"[\s\S]*?\/?>/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[\s\S]*?\/?>/gi, '')
    .replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/gi, '');
  const url = `${SITE_URL}${head.path}`;
  const tags = [
    `<title>${escText(head.title)}</title>`,
    `<meta name="description" content="${escAttr(head.description)}" />`,
    `<link rel="canonical" href="${escAttr(url)}" />`,
    `<meta property="og:type" content="${head.type}" />`,
    `<meta property="og:url" content="${escAttr(url)}" />`,
    `<meta property="og:title" content="${escAttr(head.title)}" />`,
    `<meta property="og:description" content="${escAttr(head.description)}" />`,
    `<meta property="og:image" content="${escAttr(head.image.url)}" />`,
    `<meta property="og:image:width" content="${head.image.width}" />`,
    `<meta property="og:image:height" content="${head.image.height}" />`,
    `<meta property="og:image:alt" content="${escAttr(head.image.alt)}" />`,
    `<meta property="og:site_name" content="WriteReady IELTS" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escAttr(head.title)}" />`,
    `<meta name="twitter:description" content="${escAttr(head.description)}" />`,
    `<meta name="twitter:image" content="${escAttr(head.image.url)}" />`,
    `<meta name="twitter:image:alt" content="${escAttr(head.image.alt)}" />`,
    ...(head.preloadImage ? [`<link rel="preload" as="image" href="${escAttr(head.preloadImage)}" fetchpriority="high" />`] : []),
    ...head.jsonLd.map((ld) => `<script type="application/ld+json">${scriptJson(ld)}</script>`),
    `<script id="${EMBEDDED_DATA_ID}" type="application/json">${scriptJson(head.embedded)}</script>`,
  ].join('\n    ');
  html = html.replace(/<\/head>/i, `    ${tags}\n  </head>`);

  // The loading logo in #root becomes the page itself. React replaces it
  // with the same page when the app starts.
  const start = html.indexOf('<div id="root">');
  const bodyEnd = html.lastIndexOf('</body>');
  const rootEnd = html.lastIndexOf('</div>', bodyEnd);
  if (start < 0 || bodyEnd < 0 || rootEnd < start) throw new Error('index.html has no <div id="root"> to fill');
  return `${html.slice(0, start)}<div id="root">${appHtml}</div>${html.slice(rootEnd + '</div>'.length)}`;
}

const render = (path: string, node: ReactNode) =>
  renderToString(<StaticRouter location={path}><QuestionsShell>{node}</QuestionsShell></StaticRouter>);

function articleLd(p: QuestionPageData, title: string, description: string, imageUrl: string) {
  const url = `${SITE_URL}${questionPath(p.taskType, p.slug)}`;
  const org = { '@type': 'Organization', name: 'WriteReady IELTS', url: SITE_URL, logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` } };
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title.length > 110 ? `${title.slice(0, 107)}…` : title,
      description,
      image: [imageUrl],
      datePublished: p.publishedAt,
      dateModified: p.updatedAt,
      author: org,
      publisher: org,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      inLanguage: 'en',
      articleSection: `IELTS Writing ${taskLabel(p.taskType)}`,
      about: p.topic,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Sample answers', item: `${SITE_URL}/questions` },
        { '@type': 'ListItem', position: 2, name: taskLabel(p.taskType), item: `${SITE_URL}/questions?task=${p.taskType}` },
        { '@type': 'ListItem', position: 3, name: titleCase(p.title), item: url },
      ],
    },
  ];
}

export function renderSite(template: string, site: BuiltSite): OutFile[] {
  const files: OutFile[] = [...site.images];
  for (const p of site.pages) {
    const path = questionPath(p.taskType, p.slug);
    const title = pageTitle(p);
    const description = pageDescription(p);
    const chart = p.image?.kind === 'image' ? p.image : null;
    const image = chart
      ? { url: `${SITE_URL}${chart.src}`, width: chart.width, height: chart.height, alt: chart.alt }
      : DEFAULT_OG;
    const html = pageHtml(template, {
      title,
      description,
      path,
      type: 'article',
      image,
      preloadImage: chart?.src,
      jsonLd: articleLd(p, title, description, image.url),
      embedded: { path, kind: 'question', data: p },
    }, render(path, <QuestionView data={p} />));
    files.push({ path: `questions/${p.taskType}/${p.slug}/index.html`, content: html });
    files.push({ path: questionDataPath(p.taskType, p.slug).slice(1), content: JSON.stringify(p) });
  }

  const indexHtml = pageHtml(template, {
    title: INDEX_TITLE,
    description: INDEX_DESCRIPTION,
    path: '/questions',
    type: 'website',
    image: DEFAULT_OG,
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'IELTS Writing sample answers',
      url: `${SITE_URL}/questions`,
      description: INDEX_DESCRIPTION,
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: site.index.questions.map((q, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${SITE_URL}${questionPath(q.taskType, q.slug)}`,
          name: `${taskLabel(q.taskType)}: ${titleCase(q.title)} — Band ${fmtBand(q.bestBand)}`,
        })),
      },
    }],
    embedded: { path: '/questions', kind: 'index', data: site.index },
  }, render('/questions', <QuestionList data={site.index} />));
  files.push({ path: 'questions/index.html', content: indexHtml });
  files.push({ path: 'question-data/index.json', content: JSON.stringify(site.index) });
  return files;
}

/**
 * dist/404.html, which Vercel serves (with a 404 status) for a file that does
 * not exist: a question page that was never built or was taken down. It is
 * the app itself, so the visitor gets the site's own "not found" screen with
 * links back, instead of Vercel's plain-text one. Kept out of search results.
 */
export function notFoundHtml(template: string): string {
  return template
    .replace(/<meta\s+name="robots"[\s\S]*?\/?>/gi, '')
    .replace(/<\/head>/i, '    <meta name="robots" content="noindex" />\n  </head>');
}

// ── Sitemap ──────────────────────────────────────────────────────────────────

/**
 * The site's own pages (public/sitemap.xml, moved to the www address the site
 * answers on) plus /questions and every question page, with the chart of each
 * Task 1 page as an image entry.
 */
export function sitemapXml(staticSitemap: string, site: BuiltSite): string {
  const blocks = (staticSitemap.match(/<url>[\s\S]*?<\/url>/g) ?? [])
    .map((b) => b.replace(/https:\/\/writeready\.uz/g, SITE_URL))
    .filter((b) => !b.includes(`<loc>${SITE_URL}/questions`));
  const day = (iso: string) => iso.slice(0, 10);
  const lastUpdate = site.pages.reduce((max, p) => (p.updatedAt > max ? p.updatedAt : max), site.index.generatedAt);
  blocks.push(`<url>\n    <loc>${SITE_URL}/questions</loc>\n    <lastmod>${day(lastUpdate)}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`);
  for (const p of site.pages) {
    const image = p.image?.kind === 'image'
      ? `\n    <image:image>\n      <image:loc>${escText(`${SITE_URL}${p.image.src}`)}</image:loc>\n    </image:image>`
      : '';
    blocks.push(`<url>\n    <loc>${escText(`${SITE_URL}${questionPath(p.taskType, p.slug)}`)}</loc>\n    <lastmod>${day(p.updatedAt)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>${image}\n  </url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n  ${blocks.join('\n  ')}\n</urlset>\n`;
}
