import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Search, Users } from 'lucide-react';
import { fmtBand, questionPath, taskLabel, titleCase, type QuestionIndexData, type QuestionTask } from '@/lib/questionData';

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

  const topics = useMemo(
    () => data.topics.filter((t) => data.questions.some((q) => q.topic === t && (task === 'all' || q.taskType === task))),
    [data, task],
  );
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
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" aria-hidden />
          <label className="sr-only" htmlFor="question-search">Search questions</label>
          <input
            id="question-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, e.g. technology, line graph"
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
    </div>
  );
}
