import { Link } from 'react-router';
import { Tooltip } from 'radix-ui';
import { BookOpen, ChevronRight, ExternalLink, FileText, ListOrdered, PenLine, Sparkles, Users } from 'lucide-react';
import { PROMPT_SOURCES } from '@/lib/promptSources';
import {
  fmtBand, questionPath, taskLabel, titleCase, writeItPathFor,
  type PublicSample, type PublicVocab, type QuestionPageData, type QuestionSummary,
} from '@/lib/questionData';
import { paragraphSegments, type EssaySegment } from '@/lib/essayHighlights';

/**
 * One question's public page: the question, its chart (Task 1), the outline,
 * the published sample answers, vocabulary with Uzbek, grammar highlights,
 * related questions and the question's source. Rendered to HTML at build time
 * and again by the app, from the same data, so it must stay free of browser
 * and Firebase calls.
 */

const MODE_NAMES: Record<string, string> = { mock: 'Mock exam', practice: 'Practice', quickwrite: 'Quick Write', relax: 'Relax' };

function WriteButton({ data, className = '' }: { data: QuestionPageData; className?: string }) {
  return (
    <Link
      to={writeItPathFor(data)}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--ink-blue)] px-5 py-2.5 text-center text-sm font-semibold text-white no-underline transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 dark:text-[var(--primary-foreground)] ${className}`}
    >
      <PenLine className="h-4 w-4 shrink-0" aria-hidden />
      Write your own answer and get your band score
    </Link>
  );
}

function SectionTitle({ icon: Icon, children, id }: { icon: typeof BookOpen; children: string; id: string }) {
  return (
    <h2 id={id} className="m-0 flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
      <Icon className="h-[18px] w-[18px] text-[var(--ink-blue)]" aria-hidden />
      {children}
    </h2>
  );
}

function Criteria({ sample, taskType }: { sample: PublicSample; taskType: QuestionPageData['taskType'] }) {
  if (!sample.criteria) return null;
  const c = sample.criteria;
  const items: [string, string, number][] = [
    [taskType === 'task1' ? 'TA' : 'TR', taskType === 'task1' ? 'Task Achievement' : 'Task Response', c.taskScore],
    ['CC', 'Coherence and Cohesion', c.cc],
    ['LR', 'Lexical Resource', c.lr],
    ['GRA', 'Grammatical Range and Accuracy', c.gra],
  ];
  return (
    <ul className="m-0 mt-3 flex list-none flex-wrap gap-1.5 p-0" aria-label="Band for each criterion">
      {items.map(([short, long, band]) => (
        <li key={short} title={long} className="rounded-full border border-[var(--border-color)] bg-[var(--bg-base)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
          <abbr title={long} className="no-underline">{short}</abbr>{' '}
          <span className="font-mono font-semibold tabular-nums text-[var(--text-primary)]">{fmtBand(band)}</span>
        </li>
      ))}
    </ul>
  );
}

/** A highlighted vocabulary word, with its meaning on hover or focus. */
function VocabMark({ segment }: { segment: Extract<EssaySegment, { type: 'vocab' }> }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <mark
          tabIndex={0}
          className="cursor-help rounded-[3px] bg-[var(--accent)]/70 px-0.5 py-px text-inherit underline decoration-dotted decoration-[var(--ink-blue)] underline-offset-[3px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {segment.text}
        </mark>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={6} collisionPadding={8} className="z-[300] max-w-[260px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-left text-xs leading-snug text-[var(--text-primary)] shadow-[var(--shadow-lg)]">
          <p className="m-0 font-semibold">{segment.vocab.meaning}</p>
          <p className="m-0 mt-1" lang="uz">
            <span className="mr-1 rounded bg-[var(--accent)] px-1 py-0.5 font-mono text-[0.625rem] font-semibold text-[var(--accent-foreground)]">UZ</span>
            {segment.vocab.uz}
          </p>
          <Tooltip.Arrow className="fill-[var(--bg-card)]" width={10} height={5} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** A highlighted grammar structure, labelled Advanced, with the examiner's note on hover or focus. */
function GrammarMark({ segment }: { segment: Extract<EssaySegment, { type: 'grammar' }> }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <mark
          tabIndex={0}
          className="cursor-help rounded-[3px] bg-emerald-500/15 px-0.5 py-px text-inherit underline decoration-dotted decoration-emerald-600 underline-offset-[3px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] dark:decoration-emerald-400"
        >
          {segment.text}
        </mark>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={6} collisionPadding={8} className="z-[300] max-w-[280px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-left text-xs leading-snug text-[var(--text-primary)] shadow-[var(--shadow-lg)]">
          <span className="mb-1 inline-block rounded-full bg-emerald-600 px-1.5 py-[1px] text-[0.625rem] font-bold uppercase tracking-wide text-white">Advanced</span>
          <p className="m-0">{segment.note}</p>
          <Tooltip.Arrow className="fill-[var(--bg-card)]" width={10} height={5} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function EssayParagraph({ segments }: { segments: EssaySegment[] }) {
  return (
    <p>
      {segments.map((seg, i) => {
        if (seg.type === 'vocab') return <VocabMark key={i} segment={seg} />;
        if (seg.type === 'grammar') return <GrammarMark key={i} segment={seg} />;
        return <span key={i}>{seg.text}</span>;
      })}
    </p>
  );
}

function SampleAnswer({
  sample, taskType, index, highlight,
}: {
  sample: PublicSample;
  taskType: QuestionPageData['taskType'];
  index: number;
  /** This sample's own vocabulary and grammar notes, marked inline when given. */
  highlight?: { vocabulary: PublicVocab[]; grammarHighlights: string[] };
}) {
  const student = sample.sourceType === 'student';
  const headingId = `sample-${index}`;
  return (
    <article aria-labelledby={headingId} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-sm)] sm:p-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={headingId} className="m-0 flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
            {student ? <Users className="h-4 w-4 text-[var(--ink-blue)]" aria-hidden /> : <Sparkles className="h-4 w-4 text-[var(--ink-blue)]" aria-hidden />}
            {student ? 'Student answer' : 'Model answer'} — Band <span className="font-mono tabular-nums">{fmtBand(sample.band)}</span>
          </h3>
          <p className="m-0 mt-1 text-xs text-[var(--text-secondary)]">
            {student
              ? `Written by a WriteReady student${sample.mode && MODE_NAMES[sample.mode] ? ` in ${MODE_NAMES[sample.mode]}` : ''}, shared anonymously`
              : 'Written by WriteReady AI and reviewed by our team'}
            {' · '}
            <span className="font-mono tabular-nums">{sample.wordCount}</span> words
          </p>
        </div>
      </header>
      <Criteria sample={sample} taskType={taskType} />
      <div className="mt-5 max-w-[70ch] space-y-4 text-[1.0625rem] leading-[1.75] text-[var(--text-primary)]">
        {highlight
          ? paragraphSegments(sample.sampleAnswer, highlight.vocabulary, highlight.grammarHighlights).map((segs, i) => (
              <EssayParagraph key={i} segments={segs} />
            ))
          : sample.sampleAnswer.split(/\n+/).filter((p) => p.trim()).map((p, i) => (
              <p key={i}>{p.trim()}</p>
            ))}
      </div>
    </article>
  );
}

export function RelatedList({ items }: { items: QuestionSummary[] }) {
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
      {items.map((q) => (
        <li key={`${q.taskType}/${q.slug}`}>
          <Link
            to={questionPath(q.taskType, q.slug)}
            className="group flex h-full flex-col gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 no-underline shadow-[var(--shadow-sm)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {taskLabel(q.taskType)} · {q.taskType === 'task1' && q.chartType ? q.chartType : q.topic}
            </span>
            <span className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--ink-blue)]">{titleCase(q.title)}</span>
            <span className="text-sm text-[var(--text-secondary)]">
              Band <span className="font-mono tabular-nums">{fmtBand(q.bestBand)}</span> sample
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SourceCredit() {
  return (
    <p className="m-0 text-xs italic text-[var(--text-secondary)]">
      Question source:{' '}
      {PROMPT_SOURCES.map((s, i) => (
        <span key={s.name}>
          {i > 0 && ' / '}
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[var(--text-secondary)] underline-offset-2 hover:underline">
            {s.name}
          </a>
        </span>
      ))}
    </p>
  );
}

export function QuestionView({ data }: { data: QuestionPageData }) {
  const task = taskLabel(data.taskType);
  const kind = data.taskType === 'task1' && data.chartType ? data.chartType : data.topic;
  const heading = titleCase(data.title);
  const hasNotes = data.vocabulary.length > 0 || data.grammarHighlights.length > 0;
  // The vocabulary and grammar notes are the reviewed AI answer's own (or the student's, when there is no AI one) — scripts/lib/questionSite.tsx.
  const notesSampleId = data.samples.find((s) => s.sourceType === 'ai')?.id ?? data.samples[0]?.id;
  return (
    <div className={`mx-auto w-full px-4 pb-16 pt-6 sm:px-6 sm:pt-10 ${hasNotes ? 'max-w-[1040px]' : 'max-w-[860px]'}`}>
      <nav aria-label="Breadcrumb" className="text-sm text-[var(--text-secondary)]">
        <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
          <li><Link to="/questions" className="text-[var(--text-secondary)] no-underline hover:text-[var(--text-primary)] hover:underline">Sample answers</Link></li>
          <li aria-hidden><ChevronRight className="h-3.5 w-3.5" /></li>
          <li><Link to={`/questions?task=${data.taskType}`} className="text-[var(--text-secondary)] no-underline hover:text-[var(--text-primary)] hover:underline">{task}</Link></li>
        </ol>
      </nav>

      <header className="mt-3">
        <p className="m-0 text-sm font-semibold text-[var(--ink-blue)]">IELTS Writing {task} · {kind}</p>
        <h1 className="m-0 mt-1 text-[1.75rem] font-extrabold leading-tight tracking-[-0.025em] text-[var(--text-primary)] sm:text-4xl">
          {heading}: Band {fmtBand(Math.max(...data.samples.map((s) => s.band)))} sample answer
        </h1>
      </header>

      <section aria-labelledby="question-title" className="mt-6 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-sm)] sm:p-7">
        <h2 id="question-title" className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">The question</h2>
        <div className="mt-2 max-w-[70ch] space-y-3 text-base font-medium leading-relaxed text-[var(--text-primary)] sm:text-[1.0625rem]">
          {data.questionText.split(/\n+/).filter((p) => p.trim()).map((p, i) => <p key={i}>{p.trim()}</p>)}
        </div>
        {data.image && data.image.kind === 'image' && (
          <figure className="m-0 mt-5">
            {/* The chart is the page's main content: it loads at once, never lazily, with its size set so nothing jumps. Tapping opens it full size. */}
            <a href={data.image.src} target="_blank" rel="noopener" className="block overflow-hidden rounded-xl border border-[var(--border-color)] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
              <img
                src={data.image.src}
                alt={data.image.alt}
                width={data.image.width}
                height={data.image.height}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="block h-auto w-full"
              />
            </a>
            <figcaption className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Tap the chart to open it full size.
            </figcaption>
          </figure>
        )}
        {data.image && data.image.kind === 'pdf' && (
          <a
            href={data.image.src}
            target="_blank"
            rel="noopener"
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] no-underline hover:bg-[var(--bg-subtle)]"
          >
            <FileText className="h-4 w-4 text-[var(--ink-blue)]" aria-hidden /> Open the chart (PDF)
            <span className="sr-only">: {data.image.alt}</span>
          </a>
        )}
        <div className="mt-6">
          <WriteButton data={data} className="w-full sm:w-auto" />
          <p className="m-0 mt-2 text-xs text-[var(--text-secondary)]">Free to start. Your essay is marked against the official IELTS band descriptors.</p>
        </div>
      </section>

      {data.outline.length > 0 && (
        <section aria-labelledby="outline-title" className="mt-10">
          <SectionTitle icon={ListOrdered} id="outline-title">Outline</SectionTitle>
          <ol className="m-0 mt-3 list-decimal space-y-1.5 pl-5 text-[var(--text-primary)] marker:font-mono marker:text-[var(--text-secondary)]">
            {data.outline.map((line, i) => <li key={i} className="pl-1 leading-relaxed">{line}</li>)}
          </ol>
        </section>
      )}

      <section aria-labelledby="samples-title" className="mt-10">
        <SectionTitle icon={BookOpen} id="samples-title">{data.samples.length > 1 ? 'Sample answers' : 'Sample answer'}</SectionTitle>
        <Tooltip.Provider delayDuration={150}>
          <div className={hasNotes ? 'mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6' : 'mt-4'}>
            <div className={hasNotes ? 'space-y-5 lg:sticky lg:top-20' : 'space-y-5'}>
              {data.samples.map((s, i) => (
                <SampleAnswer
                  key={s.id}
                  sample={s}
                  taskType={data.taskType}
                  index={i}
                  highlight={hasNotes && s.id === notesSampleId ? { vocabulary: data.vocabulary, grammarHighlights: data.grammarHighlights } : undefined}
                />
              ))}
            </div>
            {hasNotes && (
              <div className="mt-8 space-y-8 lg:mt-0">
                {data.vocabulary.length > 0 && (
                  <div aria-labelledby="vocab-title">
                    <SectionTitle icon={Sparkles} id="vocab-title">Vocabulary</SectionTitle>
                    <ul className="m-0 mt-3 list-none space-y-3 p-0">
                      {data.vocabulary.map((v) => (
                        <li key={v.word} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-sm)]">
                          <p className="m-0 font-bold text-[var(--text-primary)]">{v.word}</p>
                          <p className="m-0 mt-1 text-sm text-[var(--text-secondary)]">{v.meaning}</p>
                          <p className="m-0 mt-2 text-sm text-[var(--text-primary)]" lang="uz">
                            <span className="mr-1.5 rounded bg-[var(--accent)] px-1.5 py-0.5 font-mono text-[0.6875rem] font-semibold text-[var(--accent-foreground)]">UZ</span>
                            {v.uz}
                          </p>
                          {v.example && <p className="m-0 mt-2 border-l-2 border-[var(--border-color)] pl-3 text-sm italic text-[var(--text-secondary)]">{v.example}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.grammarHighlights.length > 0 && (
                  <div aria-labelledby="grammar-title">
                    <SectionTitle icon={FileText} id="grammar-title">Grammar highlights</SectionTitle>
                    <ul className="m-0 mt-3 list-disc space-y-2 pl-5 text-[var(--text-primary)] marker:text-[var(--ink-blue)]">
                      {data.grammarHighlights.map((g, i) => <li key={i} className="pl-1 leading-relaxed">{g}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </Tooltip.Provider>
      </section>

      <section className="mt-10 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 text-center shadow-[var(--shadow-sm)] sm:p-7">
        <p className="m-0 text-lg font-bold text-[var(--text-primary)]">Can you write a Band {fmtBand(Math.max(...data.samples.map((s) => s.band)))} answer?</p>
        <p className="m-0 mt-1 text-sm text-[var(--text-secondary)]">Write this question in Quick Write and see your band for each criterion.</p>
        <WriteButton data={data} className="mt-4 w-full sm:w-auto" />
      </section>

      {data.related.length > 0 && (
        <section aria-labelledby="related-title" className="mt-10">
          <h2 id="related-title" className="m-0 text-lg font-bold text-[var(--text-primary)]">Related questions</h2>
          <div className="mt-4"><RelatedList items={data.related} /></div>
        </section>
      )}

      {data.sourceCredit && <div className="mt-10"><SourceCredit /></div>}
    </div>
  );
}
