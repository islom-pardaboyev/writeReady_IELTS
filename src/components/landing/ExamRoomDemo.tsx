import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronRight, Clock, RotateCcw } from 'lucide-react';

// The home page's first viewport: WriteReady's own Mock Exam screen, with a
// sample answer typed into it and then marked. Everything here is a made-up
// sample (the figcaption says so); the marks match what a real report gives:
// sentence notes, a better word with its Uzbek meaning, four criterion bands.

const PROMPT =
  'Some people think that studying online works just as well as studying in a classroom. To what extent do you agree or disagree?';

type Mark = 'grammar' | 'word';

// The answer, a phrase at a time. A phrase with a mark gets underlined (a
// mistake) or highlighted (a word worth upgrading) once the typing ends.
const ANSWER: { text: string; mark?: Mark }[] = [
  { text: 'Over the last few years, online courses' },
  { text: 'have became', mark: 'grammar' },
  { text: 'very popular among students in Uzbekistan.' },
  { text: 'Technology have', mark: 'grammar' },
  { text: 'changed the way we learn' },
  { text: 'dramatically,', mark: 'word' },
  { text: 'and many people now study from home. In my opinion, online study can be as effective as a classroom, but only for learners who are disciplined enough to follow a plan without a teacher watching them.' },
];

const WORDS = ANSWER.flatMap((part, i) => part.text.split(' ').map((w) => ({ w, part: i })));
const FULL_TEXT = ANSWER.map((p) => p.text).join(' ');

const CRITERIA: [string, number][] = [
  ['Task Response', 6.5],
  ['Coherence and Cohesion', 7],
  ['Lexical Resource', 6.5],
  ['Grammatical Range and Accuracy', 6],
];

const NOTES: { kind: string; from: string; to: string; why: string }[] = [
  { kind: 'Grammar', from: 'have became', to: 'have become', why: 'After "have", use the past participle.' },
  { kind: 'Grammar', from: 'Technology have', to: 'Technology has', why: '"Technology" is one thing, so the verb is singular.' },
  { kind: 'Better word', from: 'dramatically', to: 'profoundly', why: 'Uzbek: tubdan. "has profoundly changed the way we learn"' },
];

const EXAM_SECONDS = 60 * 60;
const START_SECONDS = 38 * 60 + 12;
const WORD_MS = 55;

type Phase = 'typing' | 'marked';

function clock(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function ExamRoomDemo() {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(reduced ? WORDS.length : 0);
  const [phase, setPhase] = useState<Phase>(reduced ? 'marked' : 'typing');
  const [seconds, setSeconds] = useState(START_SECONDS);
  const [run, setRun] = useState(0);
  const answerRef = useRef<HTMLDivElement>(null);

  // Type the answer a word at a time, then mark it.
  useEffect(() => {
    if (phase !== 'typing') return;
    let i = 0;
    let typing = 0;
    let finish = 0;
    const start = window.setTimeout(() => {
      typing = window.setInterval(() => {
        i += 1;
        setShown(i);
        if (i >= WORDS.length) {
          window.clearInterval(typing);
          finish = window.setTimeout(() => setPhase('marked'), 350);
        }
      }, WORD_MS);
    }, 700);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(typing);
      window.clearTimeout(finish);
    };
  }, [phase, run]);

  // The clock runs while the answer is being written.
  useEffect(() => {
    if (phase !== 'typing') return;
    const id = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  // Keep the newest line in view while typing; once marked, go back to the
  // top so the first marks are the ones on screen.
  useEffect(() => {
    const el = answerRef.current;
    if (el) el.scrollTop = phase === 'marked' ? 0 : el.scrollHeight;
  }, [shown, phase]);

  const replay = () => {
    setShown(0);
    setSeconds(START_SECONDS);
    setPhase('typing');
    setRun((r) => r + 1);
  };

  const marked = phase === 'marked';
  const visible = WORDS.slice(0, shown);

  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]">
        {/* The Mock Exam's own top bar */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-2.5 sm:px-5">
          <span className="text-xs font-semibold tracking-[0.16em] text-[var(--text-secondary)]">
            WRITEREADY <ChevronRight className="mx-0.5 inline size-3 -translate-y-px text-[var(--border-strong)]" aria-hidden="true" />
            <span className="font-medium tracking-normal text-[var(--text-primary)]">Mock Exam</span>
          </span>
          <span aria-hidden="true" className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]">
            <Clock className="hidden size-3.5 sm:block" />
            <span className="font-mono tabular-nums">{clock(seconds)}</span>
          </span>
          <span
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-300 ${
              marked ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950' : 'bg-brand-600 text-white dark:bg-brand-400 dark:text-slate-950'
            }`}
          >
            {marked ? 'Checked' : 'Finish'}
          </span>
        </div>
        <div className="h-0.5 bg-[var(--border-color)]">
          <div className="h-full bg-brand-600 transition-[width] duration-1000 ease-linear dark:bg-brand-400" style={{ width: `${((EXAM_SECONDS - seconds) / EXAM_SECONDS) * 100}%` }} />
        </div>

        {/* Task tabs and the instruction line */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border-color)] bg-[var(--bg-base)] px-4 py-2.5 sm:px-5">
          <span className="flex gap-1" aria-hidden="true">
            <span className="rounded-lg px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">Task 1</span>
            <span className="rounded-lg bg-[var(--text-primary)] px-3 py-1 text-xs font-medium text-[var(--bg-card)]">Task 2</span>
          </span>
          <span className="text-xs text-[var(--text-secondary)]">
            Spend about <strong className="font-semibold text-[var(--text-primary)]">40 minutes</strong> on this task. Write at least{' '}
            <strong className="font-semibold text-[var(--text-primary)]">250 words</strong>.
          </span>
          {marked && !reduced && (
            <button
              type="button"
              onClick={replay}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Replay
            </button>
          )}
        </div>

        {/* Question, answer, and the report slip once it is marked */}
        <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="border-b border-[var(--border-color)] p-4 sm:p-5 md:border-b-0 md:border-r">
            <p className="border border-[var(--border-color)] p-3.5 text-sm font-bold leading-relaxed text-[var(--text-primary)] sm:p-4">{PROMPT}</p>
            <p className="mt-3 hidden text-xs leading-relaxed text-[var(--text-secondary)] md:block">
              Give reasons for your answer and include relevant examples from your own knowledge or experience.
            </p>
          </div>

          <div className="flex min-w-0 flex-col">
            <div
              ref={answerRef}
              aria-hidden="true"
              className="h-[20rem] overflow-y-auto px-4 py-4 text-base leading-[1.75] text-[var(--text-primary)] sm:h-60 sm:px-5 md:h-64 lg:h-48"
            >
              {visible.map(({ w, part }, i) => {
                const mark = ANSWER[part].mark;
                const cls =
                  marked && mark === 'grammar'
                    ? 'underline decoration-red-500 decoration-wavy decoration-[1.5px] underline-offset-4'
                    : marked && mark === 'word'
                      ? 'rounded-[3px] bg-amber-100 px-0.5 dark:bg-amber-400/25'
                      : '';
                return (
                  <span key={i} className={`transition-colors duration-500 ${cls}`}>
                    {w}{' '}
                  </span>
                );
              })}
              {!marked && <span className="ml-px inline-block h-[1.1em] w-px translate-y-[3px] bg-[var(--text-primary)] motion-safe:animate-pulse" />}
            </div>
            <p className="sr-only">Sample answer: {FULL_TEXT}</p>

            <div className="flex items-center justify-between border-t border-[var(--border-color)] px-4 py-2 text-xs text-[var(--text-secondary)] sm:px-5">
              <span className="font-mono tabular-nums">{shown} words</span>
              <span>{marked ? 'Marked: 2 grammar notes, 1 better word' : 'Writing…'}</span>
            </div>
          </div>
        </div>

        {/* The report slip: what came back for this paragraph */}
        <div
          className={`grid border-t border-[var(--border-color)] bg-[var(--bg-base)] transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] ${
            marked ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
          }`}
          aria-hidden={!marked}
        >
          <div className="border-b border-[var(--border-color)] p-4 sm:p-5 md:border-b-0 md:border-r">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Estimated band</p>
              <p className="font-mono text-3xl font-semibold tracking-[-0.02em] text-[var(--text-primary)] tabular-nums">6.5</p>
            </div>
            <dl className="mt-3 flex flex-col gap-2">
              {CRITERIA.map(([name, band]) => (
                <div key={name} className="grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-x-3 gap-y-1">
                  <dt className="truncate text-xs text-[var(--text-secondary)]">{name}</dt>
                  <dd className="text-right font-mono text-xs font-semibold text-[var(--text-primary)] tabular-nums">{band.toFixed(1)}</dd>
                  <span aria-hidden="true" className="col-span-2 h-1 overflow-hidden rounded-full bg-[var(--border-color)] dark:bg-[var(--border-strong)]">
                    <span
                      className="block h-full rounded-full bg-brand-600 transition-[width] delay-300 duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] dark:bg-brand-400"
                      style={{ width: marked ? `${(band / 9) * 100}%` : '0%' }}
                    />
                  </span>
                </div>
              ))}
            </dl>
          </div>
          <ul className="flex flex-col divide-y divide-[var(--border-color)] p-0">
            {NOTES.map((n, i) => (
              <li
                key={n.from}
                className="px-4 py-3 transition-opacity duration-500 sm:px-5"
                style={{ transitionDelay: marked ? `${250 + i * 150}ms` : '0ms', opacity: marked ? 1 : 0 }}
              >
                <p className="text-xs font-semibold text-[var(--text-secondary)]">{n.kind}</p>
                <p className="mt-0.5 text-sm text-[var(--text-primary)]">
                  <span className={n.kind === 'Grammar' ? 'text-red-600 line-through decoration-1 dark:text-red-400' : 'text-[var(--text-secondary)]'}>{n.from}</span>
                  <ArrowRight className="mx-1.5 inline size-3.5 -translate-y-px text-[var(--text-secondary)]" aria-hidden="true" />
                  <span className="sr-only">becomes</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">{n.to}</span>
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{n.why}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-[var(--text-secondary)]">
        A sample paragraph and the marks it gets. Your own report covers the whole essay.
      </figcaption>
    </figure>
  );
}
