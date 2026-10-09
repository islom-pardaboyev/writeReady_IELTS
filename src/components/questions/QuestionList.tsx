import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PenLine, Search, Send, Users } from 'lucide-react';
import { fmtBand, questionPath, taskLabel, titleCase, type QuestionIndexData, type QuestionTask } from '@/lib/questionData';
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

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <header>
        <p className="m-0 text-sm font-semibold text-[var(--ink-blue)]">IELTS Writing</p>
        <h1 className="m-0 mt-1 text-[1.75rem] font-extrabold leading-tight tracking-[-0.025em] text-[var(--text-primary)] sm:text-4xl">
          Band 7+ sample answers
        </h1>
        <p className="m-0 mt-2 max-w-[62ch] text-base leading-relaxed text-[var(--text-secondary)]">
          Real exam questions with Band 7 and higher answers from WriteReady students and model answers, each with
          an outline, vocabulary in Uzbek and grammar notes. Write your own answer to any question and get your band score.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="group" aria-label="Task" className="inline-flex w-full rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] p-1 sm:w-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={task === t.id}
              onClick={() => { setTask(t.id); setTopic(''); }}
              className={`flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] sm:flex-none ${
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
              className="h-11 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:w-48"
            >
              <option value="">All topics</option>
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </>
        )}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" aria-hidden />
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
            className="h-11 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
        </div>
      </div>

      <p className="m-0 mt-4 text-sm text-[var(--text-secondary)]" aria-live="polite">
        <span className="font-mono tabular-nums">{shown.length}</span> {shown.length === 1 ? 'question' : 'questions'}
      </p>

      {shown.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] px-6 py-12 text-center">
          <p className="m-0 font-semibold text-[var(--text-primary)]">
            {data.questions.length ? 'No questions match.' : 'Sample answers are on their way.'}
          </p>
          <p className="m-0 mt-1 text-sm text-[var(--text-secondary)]">
            {data.questions.length ? 'Try another topic or a shorter search.' : 'New Band 7+ answers are added every day.'}
          </p>
        </div>
      ) : (
        <ul className="m-0 mt-3 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
          {shown.map((q) => (
            <li key={`${q.taskType}/${q.slug}`}>
              <Link
                to={questionPath(q.taskType, q.slug)}
                className="group flex h-full flex-col rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 no-underline shadow-[var(--shadow-sm)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-[var(--text-secondary)]">
                  {/* The dashboard's pair: purple for Task 1, info for Task 2 (DESIGN.md, Categorical). */}
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${q.taskType === 'task1' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'}`}>
                    {taskLabel(q.taskType)}
                  </span>
                  {q.taskType === 'task1' && q.chartType ? `${q.chartType} · ` : ''}{q.topic}
                </span>
                <span className="mt-2 text-base font-bold text-[var(--text-primary)] group-hover:text-[var(--ink-blue)]">{titleCase(q.title)}</span>
                <span className="mt-1 line-clamp-2 text-sm leading-relaxed text-[var(--text-secondary)]">{q.excerpt}</span>
                <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-sm text-[var(--text-primary)]">
                  <span>Band <span className="font-mono font-semibold tabular-nums">{fmtBand(q.bestBand)}</span></span>
                  {q.hasStudentSample && (
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                      <Users className="h-3.5 w-3.5" aria-hidden /> Student answer
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 text-center shadow-[var(--shadow-sm)] sm:p-7">
        <p className="m-0 text-lg font-bold text-[var(--text-primary)]">Don't see your question?</p>
        <p className="m-0 mt-1 text-sm text-[var(--text-secondary)]">Write any Task 1 or Task 2 question in Quick Write and see your band for each criterion.</p>
        <Link
          to="/writing/quick"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink-blue)] px-5 py-2.5 text-center text-sm font-semibold text-white no-underline transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 dark:text-[var(--primary-foreground)] sm:w-auto"
        >
          <PenLine className="h-4 w-4 shrink-0" aria-hidden />
          Write any question in Quick Write
        </Link>
        <p className="m-0 mt-4 text-sm">
          <a
            href={TELEGRAM_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] no-underline hover:text-[var(--text-primary)] hover:underline"
          >
            <Send className="h-4 w-4" aria-hidden />
            Follow us on Telegram for new sample answers
          </a>
        </p>
      </section>
    </div>
  );
}
