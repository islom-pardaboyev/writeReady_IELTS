import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { LogoLoader } from '@/components/ui/LogoLoader';
import { QuestionsShell, SignedOutActions } from '@/components/questions/QuestionsShell';
import { QuestionView } from '@/components/questions/QuestionView';
import { QuestionList } from '@/components/questions/QuestionList';
import { pageDescription, pageTitle } from '@/lib/questionData';
import { useHead, useQuestionIndex, useQuestionPage } from './questionPageData';

/**
 * /questions and /questions/:taskType/:slug in the app. The build has already
 * put the same page in the HTML (scripts/prerender-questions.tsx); these
 * render it again from the same data, inside the same frame, so the page does
 * not change when the app takes over. Imported eagerly in App.tsx for that
 * reason: a lazy page would flash a loading spinner over the finished HTML.
 */

function Actions() {
  const { user, loading } = useAuth();
  if (loading || !user) return <SignedOutActions />;
  return (
    <Link
      to="/dashboard"
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 text-sm font-semibold text-[var(--text-primary)] no-underline transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <LayoutDashboard className="h-4 w-4" aria-hidden /> Dashboard
    </Link>
  );
}

function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <LogoLoader />
    </div>
  );
}

function Missing({ error }: { error?: boolean }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="m-0 text-2xl font-bold text-[var(--text-primary)]">
        {error ? 'This page could not load.' : 'This question has no sample answer yet.'}
      </h1>
      <p className="m-0 mt-2 text-[var(--text-secondary)]">
        {error ? 'Check your connection and try again.' : 'It may have moved, or its answer is still being reviewed.'}
      </p>
      <Link to="/questions" className="mt-6 inline-flex h-10 items-center rounded-lg bg-[var(--ink-blue)] px-4 text-sm font-semibold text-white no-underline hover:opacity-90 dark:text-[var(--primary-foreground)]">
        See all sample answers
      </Link>
    </div>
  );
}

export function QuestionsIndexPage() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const load = useQuestionIndex(pathname);
  const task = params.get('task');
  useHead(
    load.state === 'ready' ? 'IELTS Writing Sample Answers (Band 7+) — Task 1 and Task 2 | WriteReady' : null,
    'Band 7+ IELTS Writing Task 1 and Task 2 sample answers to real exam questions, with outlines, vocabulary in Uzbek and grammar notes.',
    '/questions',
  );
  return (
    <QuestionsShell actions={<Actions />}>
      {load.state === 'ready' ? (
        <QuestionList key={task ?? 'all'} data={load.data} initialTask={task === 'task1' || task === 'task2' ? task : 'all'} />
      ) : load.state === 'loading' ? <Loading /> : <Missing error={load.state === 'error'} />}
    </QuestionsShell>
  );
}

export function QuestionPage() {
  const { taskType, slug } = useParams<{ taskType: string; slug: string }>();
  const { pathname } = useLocation();
  const load = useQuestionPage(taskType, slug, pathname);
  const data = load.state === 'ready' ? load.data : null;
  useHead(data ? pageTitle(data) : null, data ? pageDescription(data) : null, pathname);
  return (
    <QuestionsShell actions={<Actions />}>
      {data ? <QuestionView key={pathname} data={data} /> : load.state === 'loading' ? <Loading /> : <Missing error={load.state === 'error'} />}
    </QuestionsShell>
  );
}
