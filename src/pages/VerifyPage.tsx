import { useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AlertTriangle, BadgeCheck, CircleSlash, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/input';
import { LogoLoader } from '@/components/ui/LogoLoader';
import { bandLabel, CRITERIA, type Criterion } from '@shared/bandScore';
import { formatCode, parseCode } from '@shared/verifyCode';
import { IELTS_DISCLAIMER } from '@/lib/legal';
import Logo from '/logo.svg';

type Scores = Record<Criterion, number> & { overall: number };

interface VerifiedTask {
  taskType: 'Task 1' | 'Task 2';
  scores: Scores;
  markedAt: string;
}

type State =
  | { status: 'loading' }
  | {
      status: 'valid';
      code: string;
      name: string;
      kind: 'task' | 'full';
      tasks: VerifiedTask[];
      writing: { band: number; weighted: number } | null;
      issuedAt: string;
    }
  | { status: 'revoked' }
  | { status: 'not_found' }
  | { status: 'error' };

const LABELS: Record<Criterion, string> = {
  taskAchievement: 'Task Achievement',
  coherenceCohesion: 'Coherence and Cohesion',
  lexicalResource: 'Lexical Resource',
  grammaticalRangeAccuracy: 'Grammatical Range and Accuracy',
};
const CODES: Record<Criterion, string> = {
  taskAchievement: 'TA',
  coherenceCohesion: 'CC',
  lexicalResource: 'LR',
  grammaticalRangeAccuracy: 'GRA',
};

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * What a score card's QR code opens: writeready.uz/v/7F3K9Q2M. It shows the
 * name and bands WriteReady really gave, straight from the server (see
 * api/verify.ts), so an edited card cannot pass. Public, no sign-in, and
 * kept out of search engines.
 */
export function VerifyPage() {
  const { code: param } = useParams<{ code?: string }>();
  const code = param ? parseCode(param) : null;
  const [state, setState] = useState<State>({ status: code ? 'loading' : 'not_found' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Someone's name and score: never for search results. index.html has a
    // robots tag for the rest of the site, so change that one and put it back.
    const existing = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const meta = existing ?? document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'robots' }));
    const before = meta.content;
    meta.content = 'noindex, nofollow';
    return () => {
      if (existing) meta.content = before;
      else meta.remove();
    };
  }, []);

  useEffect(() => {
    document.title = state.status === 'valid' ? `Verified score: ${state.name} | WriteReady IELTS` : 'Verify a score | WriteReady IELTS';
  }, [state]);

  useEffect(() => {
    if (!code) {
      setState({ status: 'not_found' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    fetch(`/api/verify?code=${encodeURIComponent(code)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data.status === 'valid' || data.status === 'revoked' || data.status === 'not_found') setState(data as State);
        else setState({ status: 'error' });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [code, attempt]);

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <header className="mx-auto flex w-full max-w-[1160px] items-center gap-2 px-5 py-5 sm:px-6">
        <Link to="/" className="flex items-center gap-2 no-underline text-[var(--text-primary)]">
          <img src={Logo} width={36} height={36} className="size-9" alt="" />
          <span className="text-lg font-bold">
            WriteReady <span className="text-[var(--ink-blue)]">IELTS</span>
          </span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[600px] flex-1 px-4 pb-16 pt-4 sm:px-6 sm:pt-8">
        {state.status === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-24 text-[var(--text-secondary)]">
            <LogoLoader size={48} />
            <span className="text-sm">Checking the code…</span>
          </div>
        )}
        {state.status === 'valid' && <Verified state={state} />}
        {state.status === 'revoked' && (
          <Outcome
            icon={<CircleSlash className="w-5 h-5" aria-hidden />}
            title="This card was withdrawn"
            body="The person who made this score card has withdrawn its verification, so WriteReady no longer confirms it."
          />
        )}
        {state.status === 'not_found' && (
          <Outcome
            icon={<SearchX className="w-5 h-5" aria-hidden />}
            title={param ? 'We could not verify this code' : 'Verify a score card'}
            body={code
              ? `No score card has the code ${formatCode(code)}. Check it against the card. If it matches, the card was not issued by WriteReady.`
              : param
                ? `“${param.slice(0, 20)}” is not a WriteReady code. A code is 8 letters and digits, like 7F3K-9Q2M.`
                : 'Scan the QR code on a WriteReady score card, or type the code printed beside it.'}
          >
            <CodeForm />
          </Outcome>
        )}
        {state.status === 'error' && (
          <Outcome
            icon={<AlertTriangle className="w-5 h-5" aria-hidden />}
            title="Verification is unavailable right now"
            body="We could not reach our records. Check your connection and try again."
          >
            <Button className="mt-6" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
          </Outcome>
        )}
      </main>

      <footer className="mx-auto w-full max-w-[600px] border-t border-[var(--border-color)] px-4 py-6 text-xs leading-relaxed text-[var(--text-secondary)] sm:px-6">
        {IELTS_DISCLAIMER}
      </footer>
    </div>
  );
}

function Verified({ state }: { state: Extract<State, { status: 'valid' }> }) {
  const lead = state.kind === 'full' && state.writing ? state.writing.band : state.tasks[0]?.scores.overall ?? 0;
  const what = state.kind === 'full' ? 'Full Writing test, Task 1 and Task 2' : `Writing ${state.tasks[0]?.taskType ?? ''}`;

  return (
    <article>
      <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
        <BadgeCheck className="w-4 h-4" aria-hidden /> Verified by WriteReady
      </p>
      <h1 className="mt-4 text-balance text-[clamp(1.75rem,6vw,2.5rem)] font-extrabold leading-tight tracking-[-0.02em]">{state.name}</h1>
      <p className="mt-1.5 text-[0.9375rem] text-[var(--text-secondary)]">{what}</p>

      <section
        aria-label="Band scores"
        className="mt-6 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-sm)] sm:p-7"
      >
        <p className="text-sm text-[var(--text-secondary)]">{state.kind === 'full' ? 'Writing band score' : 'Overall band score'}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-[4.5rem] font-medium leading-none tracking-[-0.04em] tabular-nums text-[var(--ink-blue)]">
            {/* A monospaced point is as wide as a digit, which at this size
                reads as "7 . 0"; pull the digits in around it. */}
            {lead.toFixed(1).split('.')[0]}
            <span className="-mx-[0.16em]">.</span>
            {lead.toFixed(1).split('.')[1]}
          </span>
          <span className="text-lg font-semibold">{bandLabel(lead)}</span>
        </p>

        {state.kind === 'full' && state.writing ? (
          <>
            {state.tasks.map((t) => <TaskTable key={t.taskType} task={t} heading />)}
            <p className="mt-5 border-t border-[var(--border-color)] pt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              Task 2 counts twice as much as Task 1:{' '}
              <span className="font-mono tabular-nums whitespace-nowrap text-[var(--text-primary)]">
                ({state.tasks[0].scores.overall.toFixed(1)} + 2 × {state.tasks[1].scores.overall.toFixed(1)}) ÷ 3 = {state.writing.weighted.toFixed(2)}
              </span>
              , rounded to the nearest half band.
            </p>
          </>
        ) : (
          state.tasks[0] && <TaskTable task={state.tasks[0]} />
        )}
      </section>

      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-[var(--text-secondary)]">Code</dt>
        <dd className="font-mono tabular-nums">{formatCode(state.code)}</dd>
        <dt className="text-[var(--text-secondary)]">Marked</dt>
        <dd>{state.tasks.map((t) => longDate(t.markedAt)).filter((d, i, all) => all.indexOf(d) === i).join(' and ')}</dd>
        <dt className="text-[var(--text-secondary)]">Card issued</dt>
        <dd>{longDate(state.issuedAt)}</dd>
      </dl>

      <p className="mt-6 max-w-[62ch] text-sm leading-relaxed text-[var(--text-secondary)]">
        WriteReady gave these bands to writing submitted on its site. They are an AI estimate of IELTS Writing, not
        an official IELTS result. WriteReady confirms the scores, not the identity of the person named: the name
        was entered by the account holder.
      </p>

      <div className="mt-8 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 sm:p-6">
        <p className="font-semibold">Want to know your own band?</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Write an IELTS essay and get your estimated band in minutes. One check a week is free.
        </p>
        <Link to="/" className="mt-4 inline-block">
          <Button>Check your writing</Button>
        </Link>
      </div>
    </article>
  );
}

function TaskTable({ task, heading = false }: { task: VerifiedTask; heading?: boolean }) {
  return (
    <div className={heading ? 'mt-6' : 'mt-5'}>
      {heading && (
        <p className="mb-2 flex items-baseline justify-between text-sm font-semibold">
          <span>{task.taskType}</span>
          <span className="font-mono tabular-nums">{task.scores.overall.toFixed(1)}</span>
        </p>
      )}
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{task.taskType} criteria</caption>
        <tbody>
          {CRITERIA.map((k) => (
            <tr key={k} className="border-t border-[var(--border-color)]">
              <td className="w-12 py-2.5 pr-2 font-mono text-xs text-[var(--text-secondary)]">
                {k === 'taskAchievement' && task.taskType === 'Task 2' ? 'TR' : CODES[k]}
              </td>
              <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                {k === 'taskAchievement' && task.taskType === 'Task 2' ? 'Task Response' : LABELS[k]}
              </th>
              <td className="py-2.5 text-right font-mono tabular-nums">{task.scores[k].toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Outcome({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children?: React.ReactNode }) {
  return (
    <section className="flex flex-col items-start py-10 sm:py-16">
      <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[var(--bg-subtle)] text-[var(--text-secondary)]">{icon}</span>
      <h1 className="mt-4 text-2xl font-bold tracking-[-0.02em]">{title}</h1>
      <p className="mt-2 max-w-[52ch] text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">{body}</p>
      {children}
    </section>
  );
}

function CodeForm() {
  const navigate = useNavigate();
  const inputId = useId();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      className="mt-6 flex w-full max-w-sm flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const code = parseCode(value);
        if (!code) { setInvalid(true); return; }
        navigate(`/v/${code}`);
      }}
    >
      <label htmlFor={inputId} className="text-sm font-medium">Code on the card</label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={value}
          onChange={(e) => { setValue(e.target.value); setInvalid(false); }}
          placeholder="7F3K-9Q2M"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${inputId}-error` : undefined}
          className="font-mono uppercase focus-visible:ring-[var(--ink-blue)]"
        />
        <Button type="submit">Verify</Button>
      </div>
      {invalid && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-red-700 dark:text-red-400">
          A code is 8 letters and digits, like 7F3K-9Q2M.
        </p>
      )}
    </form>
  );
}
