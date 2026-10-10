import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, PenLine, Search, Send, Sparkles, Users } from 'lucide-react';
import { fmtBand, questionPath, taskLabel, titleCase, type QuestionIndexData, type QuestionSummary, type QuestionTask } from '@/lib/questionData';
import { TELEGRAM_CHANNEL_URL } from '@/lib/links';

/**
 * Every question with a published sample, with Task 1 / Task 2 tabs, a topic
 * filter and a search box. The build renders it with no filter applied, so
 * search engines see every link; filtering happens in the browser.
 */
type TaskFilter = 'all' | QuestionTask;

const TABS: { id: TaskFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'task1', label: 'Task 1' },
  { id: 'task2', label: 'Task 2' },
];

// How to get the most from a sample answer, in the order to do it.
const STEPS = [
  { title: 'Plan the question', text: 'Read it and decide how you would answer before you look.', chip: 'bg-field-lilac' },
  { title: 'Study the answer', text: 'See the outline, the vocabulary in Uzbek and the grammar notes.', chip: 'bg-field-mint' },
  { title: 'Write it yourself', text: 'Answer the same question and get your own band score.', chip: 'bg-field-amber' },
];

/**
 * The band of a question's best answer, in the task's own colour: lilac for
 * Task 1, the ink wash for Task 2 (the same pair the dashboard's badges use).
 */
export function BandWell({ q, size = 'lg' }: { q: Pick<QuestionSummary, 'taskType' | 'bestBand'>; size?: 'lg' | 'sm' }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-2xl text-center leading-none ${size === 'lg' ? 'size-14' : 'size-12'} ${
        q.taskType === 'task1' ? 'bg-field-lilac text-field-ink' : 'bg-[var(--accent)] text-[var(--accent-foreground)]'
      }`}
    >
      <span className="sr-only">Band {fmtBand(q.bestBand)}</span>
      <span aria-hidden>
        <span className={`block font-mono font-semibold tabular-nums ${size === 'lg' ? 'text-xl' : 'text-lg'}`}>{fmtBand(q.bestBand)}</span>
        <span className="mt-1 block text-[0.6875rem] font-semibold">Band</span>
      </span>
    </span>
  );
}

export function QuestionList({ data, initialTask = 'all' }: { data: QuestionIndexData; initialTask?: TaskFilter }) {
  const [task, setTask] = useState<TaskFilter>(initialTask);
  const [topic, setTopic] = useState('');
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return data.questions.filter((q) => {
      if (task !== 'all' && q.taskType !== task) return false;
      if (topic && q.topic !== topic) return false;
      if (!words.length) return true;
      const hay = `${q.title} ${q.topic} ${q.chartType ?? ''} ${q.excerpt}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [data.questions, task, topic, query]);

  // A topic earns a spot in the dropdown once at least two questions share
  // it; one question per topic just means every option narrows to a single
  // card. The dropdown itself waits for the bank to be large enough (~30
  // questions) that filtering by topic is worth the extra control.
  const topics = useMemo(
    () => data.topics.filter((t) => data.questions.filter((q) => q.topic === t && (task === 'all' || q.taskType === task)).length >= 2),
    [data, task],
  );
  const showTopicFilter = data.questions.length >= 30 && topics.length > 0;
  const count = (t: TaskFilter) => (t === 'all' ? data.questions.length : data.questions.filter((q) => q.taskType === t).length);
  const filtered = task !== 'all' || topic !== '' || query.trim() !== '';

  return (
    <div className="mx-auto w-full max-w-[1160px] px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header>
        <h1 className="m-0 max-w-[20ch] font-display text-[clamp(2rem,4.4vw,3rem)] font-extrabold leading-[1.06] tracking-[-0.035em] text-balance text-[var(--text-primary)]">
          Band 7+ IELTS Writing sample answers
        </h1>
        <p className="m-0 mt-3 max-w-[62ch] text-[1.0625rem] leading-relaxed text-[var(--text-secondary)]">
          Real exam questions with Band 7 and higher answers from WriteReady students and model answers, each with
          an outline, vocabulary in Uzbek and grammar notes. Write your own answer to any question and get your band score.
        </p>
      </header>

      {/* How to use a sample answer */}
      <ol aria-label="How to use a sample answer" className="m-0 mt-7 grid list-none gap-x-6 gap-y-4 rounded-3xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 sm:grid-cols-3 sm:p-6">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3">
            <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-full font-mono text-sm font-semibold text-field-ink ${s.chip}`}>{i + 1}</span>
            <span>
              <span className="block text-[0.9375rem] font-bold text-[var(--text-primary)]">{s.title}</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-[var(--text-secondary)]">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="group" aria-label="Task" className="inline-flex w-full rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] p-1 sm:w-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={task === t.id}
              onClick={() => { setTask(t.id); setTopic(''); }}
              className={`flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border-0 px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] sm:flex-none ${
                task === t.id
                  ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                  : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t.label} <span className="font-mono text-xs tabular-nums opacity-70">{count(t.id)}</span>
            </button>
          ))}
        </div>
        {showTopicFilter && (
          <>
            <label className="sr-only" htmlFor="question-topic">Topic</label>
            <select
              id="question-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="h-11 rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:w-48"
            >
              <option value="">All topics</option>
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </>
        )}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" aria-hidden />
          <label className="sr-only" htmlFor="question-search">Search questions</label>
          <input
            id="question-search"
            name="q"
            type="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, e.g. technology, line graph…"
            className="h-11 w-full rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
        </div>
      </div>

      <p className="m-0 mt-4 text-sm text-[var(--text-secondary)]" aria-live="polite">
        <span className="font-mono tabular-nums">{shown.length}</span> {shown.length === 1 ? 'question' : 'questions'}
      </p>

      {shown.length === 0 ? (
        <div className="mt-4 rounded-3xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-card)] px-6 py-12 text-center">
          <p className="m-0 font-display text-lg font-extrabold text-[var(--text-primary)]">
            {data.questions.length ? 'No questions match.' : 'Sample answers are on their way.'}
          </p>
          <p className="m-0 mt-1 text-sm text-[var(--text-secondary)]">
            {data.questions.length ? 'Try another topic or a shorter search.' : 'New Band 7+ answers are added every day.'}
          </p>
          {filtered && (
            <button
              type="button"
              onClick={() => { setTask('all'); setTopic(''); setQuery(''); }}
              className="mt-5 inline-flex h-10 cursor-pointer items-center rounded-full border border-[var(--border-strong)] bg-[var(--bg-card)] px-5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Show every question
            </button>
          )}
        </div>
      ) : (
        <ul className="m-0 mt-4 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((q) => (
            <li key={`${q.taskType}/${q.slug}`}>
              <Link
                to={questionPath(q.taskType, q.slug)}
                className="group flex h-full flex-col rounded-3xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 no-underline transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-1 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span className="flex items-start gap-4">
                  <BandWell q={q} />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-[var(--text-secondary)]">
                      {taskLabel(q.taskType)} · {q.taskType === 'task1' && q.chartType ? `${q.chartType} · ` : ''}{q.topic}
                    </span>
                    <span className="mt-1 block font-display text-lg font-extrabold leading-snug tracking-[-0.01em] text-[var(--text-primary)] group-hover:text-[var(--ink-blue)]">
                      {titleCase(q.title)}
                    </span>
                  </span>
                </span>
                <span className="mt-3 line-clamp-2 text-sm leading-relaxed text-[var(--text-secondary)]">{q.excerpt}</span>
                <span className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-4">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
                    {q.hasStudentSample
                      ? <><Users className="h-3.5 w-3.5" aria-hidden /> Student answer</>
                      : <><Sparkles className="h-3.5 w-3.5" aria-hidden /> Model answer</>}
                    {q.sampleCount > 1 && <> · <span className="font-mono tabular-nums">{q.sampleCount}</span> answers</>}
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-blue)]">
                    Read the answer
                    <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-12 rounded-[32px] bg-brand-600 px-6 py-10 text-center sm:py-12">
        <h2 className="m-0 font-display text-2xl font-extrabold tracking-[-0.02em] text-white sm:text-[1.75rem]">Don't see your question?</h2>
        <p className="m-0 mx-auto mt-2 max-w-[52ch] text-[0.9375rem] leading-relaxed text-white/85">Write any Task 1 or Task 2 question in Quick Write and see your band for each criterion.</p>
        <Link
          to="/writing/quick"
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-center text-[0.9375rem] font-bold text-brand-700 no-underline transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600 motion-reduce:hover:translate-y-0 sm:w-auto"
        >
          <PenLine className="h-4 w-4 shrink-0" aria-hidden />
          Write any question in Quick Write
        </Link>
        <p className="m-0 mt-5 text-sm">
          <a
            href={TELEGRAM_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded text-white/85 no-underline hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Send className="h-4 w-4" aria-hidden />
            Follow us on Telegram for new sample answers
          </a>
        </p>
      </section>
    </div>
  );
}
