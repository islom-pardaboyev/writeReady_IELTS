import { Link } from 'react-router';
import { ArrowRight, ArrowUpRight, Bot, Building2, Check, Coffee, GraduationCap, PenLine, Send, Timer, Zap } from 'lucide-react';
import { TELEGRAM_BOT_URL, TELEGRAM_CHANNEL_URL } from '@/lib/links';
import { TELEGRAM_CONTACT_URL } from '@/lib/legal';
import { useShowTelegramBot } from '@/hooks/useFeatureFlag';
import { Header } from '@/components/layout/Header';
import { SkipLink } from '@/components/layout/SkipLink';
import { FaqAccordion, FaqAnswerStyles } from '@/components/ui/FaqAccordion';
import { ExamRoomDemo } from '@/components/landing/ExamRoomDemo';
import { HOME_QUESTIONS } from '@/lib/faq';
import { ChatBot } from '../components/ui/ChatBot';

// Essays checked so far, shown in the proof section. Set by hand for now:
// raise it as the real number grows.
const ESSAYS_CHECKED = '15+';

const HERO_POINTS = [
  'Task 1 charts and Task 2 essays',
  'New words come with their Uzbek meaning',
  'Every report saved, and downloadable as a PDF',
  'A teacher can check the same essay with Human Check',
];

// What a full report holds, in the order it is laid out (see the FAQ answer
// "Why is this better than just asking ChatGPT?" for the same list).
const REPORT_PARTS = [
  {
    title: 'Four bands and an overall score',
    text: 'Task Response (Task Achievement for Task 1), Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy, each with the reason behind it.',
  },
  {
    title: 'Every sentence, in order',
    text: 'Each sentence is checked. Where one loses marks, you see why and a better way to write it.',
  },
  {
    title: 'Up to 15 better words',
    text: 'Picked from your own essay, each with its English and Uzbek meaning and your sentence as the example.',
  },
  {
    title: 'Up to 10 grammar points',
    text: 'Mistakes you made, plus structures that would lift your grammar score if you used them.',
  },
  {
    title: 'A band 8 to 9 answer',
    text: 'A model answer to the same question, so you can see what the higher band looks like.',
  },
  {
    title: 'Three fixes to make first',
    text: 'The changes most likely to move your band on the next essay.',
  },
];

const MODES = [
  {
    title: 'Mock Exam',
    spec: '60 min · Task 1 and 2',
    text: 'Both tasks against one clock, on a screen laid out like the computer-based test.',
    href: '/writing/mock',
    Icon: Timer,
  },
  {
    title: 'Practice',
    spec: 'No timer · Task 1 and 2',
    text: 'Both tasks at your own pace, with a new question whenever you want one.',
    href: '/writing/practice',
    Icon: PenLine,
  },
  {
    title: 'Quick Write',
    spec: 'No timer · one task',
    text: 'A single Task 1 or Task 2 question for a short session. Easy to fit into every day.',
    href: '/writing/quick',
    Icon: Zap,
  },
  {
    title: 'Relax',
    spec: 'Your own question',
    text: 'Paste any question you like, add a chart if you have one, and write.',
    href: '/writing/relax',
    Icon: Coffee,
  },
];

const DEMO_VIDEOS = [
  {
    id: 'website',
    title: 'The website, start to finish',
    desc: 'Pick a mode, write against a question, and read the report your essay gets.',
    src: '/WriteReady_website_video_EN.mp4',
    poster: '/video-website-poster.jpg',
  },
  {
    id: 'bot',
    title: 'Checking an essay in Telegram',
    desc: 'Send the bot your essay and it replies with a band score in the chat, without an account.',
    src: '/WriteReady_telegram_bot_video_EN.mp4',
    poster: '/video-telegram-bot-poster.jpg',
  },
];

const H2 = 'text-[clamp(1.75rem,3.2vw,2.5rem)] font-extrabold leading-[1.1] tracking-[-0.025em] text-balance text-[var(--text-primary)]';
const LEAD = 'mt-3 max-w-[56ch] text-lg leading-relaxed text-[var(--text-secondary)]';
const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

// A report as it comes back, shortened: the bands, one sentence note and one
// word. Sample content, labelled as such.
function ReportSample() {
  const bands: [string, number][] = [
    ['Task Response', 6.5],
    ['Coherence and Cohesion', 7],
    ['Lexical Resource', 6.5],
    ['Grammatical Range and Accuracy', 6],
  ];
  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-md)]">
        <div className="flex items-end justify-between gap-4 border-b border-[var(--border-color)] px-5 py-4">
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Task 2 · Opinion essay</p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">Estimated overall band</p>
          </div>
          <p className="font-mono text-4xl font-semibold leading-none tracking-[-0.03em] text-[var(--text-primary)] tabular-nums">6.5</p>
        </div>
        <dl className="grid gap-px bg-[var(--border-color)] sm:grid-cols-2">
          {bands.map(([name, band]) => (
            <div key={name} className="bg-[var(--bg-card)] px-5 py-3">
              <dt className="text-xs text-[var(--text-secondary)]">{name}</dt>
              <dd className="mt-1 flex items-center gap-3">
                <span className="font-mono text-lg font-semibold text-[var(--text-primary)] tabular-nums">{band.toFixed(1)}</span>
                <span aria-hidden="true" className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--border-color)] dark:bg-[var(--border-strong)]">
                  <span className="block h-full rounded-full bg-brand-600 dark:bg-brand-400" style={{ width: `${(band / 9) * 100}%` }} />
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-[var(--border-color)] px-5 py-4">
          <p className="text-xs font-semibold text-[var(--text-secondary)]">Sentence 2 · Grammar</p>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-primary)]">
            <span className="text-red-600 line-through decoration-1 dark:text-red-400">Technology have changed</span> the way we learn.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-primary)]">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">Technology has changed</span> the way we learn.
          </p>
          <p className="mt-1.5 text-xs text-[var(--text-secondary)]">"Technology" is one thing, so the verb is singular.</p>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-[var(--border-color)] px-5 py-4">
          <p className="w-full text-xs font-semibold text-[var(--text-secondary)]">Better word</p>
          <p className="text-sm text-[var(--text-secondary)]">dramatically</p>
          <ArrowRight className="size-3.5 translate-y-0.5 text-[var(--text-secondary)]" aria-hidden="true" />
          <span className="sr-only">becomes</span>
          <p className="text-sm font-semibold text-[var(--text-primary)]">profoundly</p>
          <p className="text-sm text-[var(--text-secondary)]">Uzbek: tubdan</p>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-[var(--text-secondary)]">Part of a sample report</figcaption>
    </figure>
  );
}

export function LandingPage() {
  // Admin → Telegram bot: the bot is left off the page until the admin announces it.
  const botShown = useShowTelegramBot();

  return (
    <div className="bg-[var(--bg-base)] font-sans text-[var(--text-primary)]">
      <SkipLink />
      <Header />

      <main id="main-content" tabIndex={-1} className="outline-none">
        {/* ── Hero: the exam screen, and an answer being marked ── */}
        <section aria-labelledby="hero-title" className="relative overflow-hidden">
          {/* Ruled lines of an answer sheet, fading out under the headline */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_35px,var(--border-color)_35px,var(--border-color)_36px)] [mask-image:linear-gradient(to_bottom,black_30%,transparent)]"
          />
          <div className="relative mx-auto max-w-[1160px] px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:pb-20">
            <h1
              id="hero-title"
              className="text-[clamp(2.25rem,4.4vw,3.6rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-balance text-[var(--text-primary)]"
            >
              Write your IELTS essay. Find out which sentences{' '}
              <span className="text-brand-600 dark:text-brand-400">cost you marks.</span>
            </h1>
            <div className="mt-6 grid items-end gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:gap-14">
              <div>
                <p className="max-w-[58ch] text-lg leading-relaxed text-[var(--text-secondary)]">
                  Answer exam-style Task 1 and Task 2 questions, then get your writing marked against the four IELTS criteria. You
                  see an estimated band, notes on each sentence, and stronger words with their Uzbek meanings.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link
                    to="/auth?mode=signup"
                    className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--ink-blue-solid)] px-7 text-base font-semibold text-white no-underline transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
                  >
                    Check my essay
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                  <Link
                    to="/writing/mock"
                    className="inline-flex h-12 items-center rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] px-6 text-base font-semibold text-[var(--text-primary)] no-underline transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
                  >
                    Try a mock exam
                  </Link>
                </div>
                <p className="mt-4 text-sm text-[var(--text-secondary)]">
                  Free every week: one report with your four band scores. Paid plans add the full report.
                </p>
                {botShown && (
                  <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
                    No account yet?{' '}
                    <a
                      href={TELEGRAM_BOT_URL}
                      {...external}
                      className="inline-flex items-center gap-0.5 rounded font-semibold text-[var(--ink-blue)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      Get a free band score from our Telegram bot
                      <ArrowUpRight className="size-3.5" aria-hidden="true" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </p>
                )}
              </div>

              {/* Left off phones, where it would push the exam screen further down; the report section says the same. */}
              <ul className="m-0 hidden list-none flex-col gap-2.5 p-0 sm:flex lg:pb-1">
                {HERO_POINTS.map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-base text-[var(--text-primary)]">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200">
                      <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-10">
              <ExamRoomDemo />
            </div>
          </div>
        </section>

        {/* ── Proof: essays checked so far ── */}
        <section aria-labelledby="proof-title" className="border-y border-[var(--border-color)] bg-[var(--bg-card)]">
          <div className="mx-auto grid max-w-[1160px] items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:py-16">
            <div>
              <h2 id="proof-title" className="m-0">
                <span className="block font-mono text-[clamp(4rem,9vw,6.5rem)] font-semibold leading-none tracking-[-0.05em] text-[var(--text-primary)]">
                  {ESSAYS_CHECKED}
                </span>
                <span className="mt-3 block text-xl font-bold tracking-[-0.015em] text-[var(--text-primary)]">
                  essays checked on WriteReady so far
                </span>
              </h2>
              <p className="mt-2 max-w-[44ch] text-base leading-relaxed text-[var(--text-secondary)]">
                Each one was marked against the same four criteria and saved to the writer's account, so the next report can be
                compared with it.
              </p>
            </div>
            <dl className="m-0 grid gap-px overflow-hidden rounded-[14px] border border-[var(--border-color)] bg-[var(--border-color)] sm:grid-cols-3">
              {[
                { value: '4', label: 'band scores for every essay', note: 'One for each IELTS criterion, plus the overall band.' },
                { value: 'up to 15', label: 'better words per report', note: 'Taken from your essay, with Uzbek meanings.' },
                { value: 'up to 10', label: 'grammar points per report', note: 'Mistakes to fix and structures to add.' },
              ].map((s) => (
                <div key={s.label} className="flex flex-col bg-[var(--bg-card)] px-5 py-5">
                  {/* The label comes first for screen readers; the figure is drawn above it. */}
                  <dt className="order-2 mt-1.5 text-sm font-semibold text-[var(--text-primary)]">{s.label}</dt>
                  <dd className="order-1 m-0 font-mono text-3xl font-semibold tracking-[-0.03em] text-[var(--text-primary)] tabular-nums">{s.value}</dd>
                  <dd className="order-3 m-0 mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{s.note}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── What the report holds ── */}
        <section aria-labelledby="report-title" className="mx-auto max-w-[1160px] px-4 py-20 sm:px-6 lg:py-24">
          <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-16">
            <div>
              <h2 id="report-title" className={H2}>What comes back when you finish</h2>
              <p className={LEAD}>A full report follows the same order every time, so you always know where to look.</p>
              <dl className="m-0 mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                {REPORT_PARTS.map((p) => (
                  <div key={p.title} className="border-t border-[var(--border-color)] pt-4">
                    <dt className="text-base font-bold text-[var(--text-primary)]">{p.title}</dt>
                    <dd className="m-0 mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">{p.text}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-8 text-sm text-[var(--text-secondary)]">
                The free weekly report gives you the four band scores. Everything else on this list comes with a paid plan.{' '}
                <Link to="/pricing" className="font-semibold text-[var(--ink-blue)] no-underline hover:underline">
                  See the plans
                </Link>
              </p>
            </div>
            <div className="lg:sticky lg:top-24">
              <ReportSample />
            </div>
          </div>
        </section>

        {/* ── Modes ── */}
        <section aria-labelledby="modes-title" className="border-t border-[var(--border-color)] bg-[var(--bg-card)]">
          <div className="mx-auto max-w-[1160px] px-4 py-20 sm:px-6 lg:py-24">
            <h2 id="modes-title" className={H2}>Four ways to practise</h2>
            <p className={LEAD}>All four use the same marking. Pick the one that fits the time you have today.</p>
            <ul className="m-0 mt-10 grid list-none gap-px overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--border-color)] p-0 sm:grid-cols-2 lg:grid-cols-4">
              {MODES.map(({ title, spec, text, href, Icon }) => (
                <li key={title} className="bg-[var(--bg-card)]">
                  <Link
                    to={href}
                    className="group flex h-full flex-col p-6 no-underline transition-colors duration-150 hover:bg-[var(--bg-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
                  >
                    <Icon className="size-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                    <h3 className="mt-5 text-lg font-bold tracking-[-0.01em] text-[var(--text-primary)]">{title}</h3>
                    <p className="mt-1 text-xs font-medium text-[var(--text-secondary)]">{spec}</p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{text}</p>
                    <span className="mt-auto inline-flex items-center gap-1 pt-6 text-sm font-semibold text-[var(--ink-blue)]">
                      Open {title}
                      <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Beyond the AI ── */}
        <section aria-labelledby="more-title" className="mx-auto max-w-[1160px] px-4 py-20 sm:px-6 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16">
            <div>
              <h2 id="more-title" className={H2}>When you want more than the AI</h2>
              <p className={LEAD}>Some students want a teacher to read their essay. Some centres want a whole class writing here.</p>
            </div>
            <dl className="m-0 flex flex-col">
              <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 border-t border-[var(--border-color)] py-6">
                <GraduationCap className="size-6 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                <div>
                  <dt className="text-lg font-bold text-[var(--text-primary)]">Human Check</dt>
                  <dd className="m-0 mt-1.5 max-w-[60ch] text-base leading-relaxed text-[var(--text-secondary)]">
                    A teacher on WriteReady reads your essay and sends back a marked document. You choose the teacher and see the
                    price before anything is taken from your balance.
                  </dd>
                </div>
              </div>
              {botShown && (
                <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 border-t border-[var(--border-color)] py-6">
                  <Bot className="size-6 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                  <div>
                    <dt className="text-lg font-bold text-[var(--text-primary)]">The Telegram bot</dt>
                    <dd className="m-0 mt-1.5 max-w-[60ch] text-base leading-relaxed text-[var(--text-secondary)]">
                      Send an essay to the bot and get a band score back in the chat. You don't need an account for it.{' '}
                      <a href={TELEGRAM_BOT_URL} {...external} className="font-semibold text-[var(--ink-blue)] no-underline hover:underline">
                        Open the bot<span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    </dd>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 border-y border-[var(--border-color)] py-6">
                <Building2 className="size-6 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                <div>
                  <dt className="text-lg font-bold text-[var(--text-primary)]">For learning centres</dt>
                  <dd className="m-0 mt-1.5 max-w-[60ch] text-base leading-relaxed text-[var(--text-secondary)]">
                    A centre can buy places for its students, choose their plan and see how much each one practises. Centre staff
                    never see the essays themselves.{' '}
                    <a href={TELEGRAM_CONTACT_URL} {...external} className="font-semibold text-[var(--ink-blue)] no-underline hover:underline">
                      Ask us about places<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                    {' · '}
                    <Link to="/center-admin" className="font-semibold text-[var(--ink-blue)] no-underline hover:underline">
                      Centre sign-in
                    </Link>
                  </dd>
                </div>
              </div>
            </dl>
          </div>
        </section>

        {/* ── Videos ── */}
        <section aria-labelledby="videos-title" className="border-t border-[var(--border-color)] bg-[var(--bg-card)]">
          <div className="mx-auto max-w-[1160px] px-4 py-20 sm:px-6 lg:py-24">
            <h2 id="videos-title" className={H2}>See it working</h2>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {DEMO_VIDEOS.map((v) => (
                <div key={v.id} className="overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-base)]">
                  <video controls preload="none" poster={v.poster} className="block aspect-video w-full bg-black">
                    <source src={v.src} type="video/mp4" />
                    Your browser can't play this video. <a href={v.src}>Download it</a> instead.
                  </video>
                  <div className="p-5">
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">{v.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{v.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Questions ── */}
        <section aria-labelledby="faq-title" className="mx-auto max-w-[760px] px-4 py-20 sm:px-6 lg:py-24">
          <h2 id="faq-title" className={`${H2} mb-8`}>Questions people ask first</h2>
          <FaqAccordion items={HOME_QUESTIONS} />
          <p className="mt-6 text-center text-sm">
            <Link to="/faq" className="inline-flex items-center gap-1 font-semibold text-[var(--ink-blue)] no-underline hover:underline">
              All questions and answers
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </p>
        </section>

        {/* ── Close ── */}
        <section aria-labelledby="cta-title" className="relative overflow-hidden bg-slate-900 px-4 py-20 text-center sm:px-6 lg:py-24 dark:bg-black">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_35px,rgb(255_255_255/0.05)_35px,rgb(255_255_255/0.05)_36px)]"
          />
          <div className="relative mx-auto max-w-[620px]">
            <h2 id="cta-title" className="text-[clamp(1.875rem,4vw,2.75rem)] font-extrabold leading-[1.1] tracking-[-0.03em] text-balance text-white">
              Write one essay today and see your band.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/70">It's free to start. Paid plans give you more reports each month.</p>
            <Link
              to="/auth?mode=signup"
              className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-[var(--ink-blue-solid)] px-8 text-base font-semibold text-white no-underline transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              Create a free account
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] bg-slate-900 px-6 py-7 text-center dark:bg-black">
        <div className="mb-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          {[
            { href: TELEGRAM_CHANNEL_URL, label: 'Follow us on Telegram', Icon: Send },
            ...(botShown ? [{ href: TELEGRAM_BOT_URL, label: 'Essay checker bot', Icon: Bot }] : []),
          ].map(({ href, label, Icon }) => (
            <a
              key={href}
              href={href}
              {...external}
              className="group inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 no-underline transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <Icon size={15} aria-hidden="true" />
              {label}
              <ArrowUpRight size={14} className="opacity-60 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ))}
        </div>
        <nav aria-label="Legal" className="mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
          {[
            ['/faq', 'FAQ'],
            ['/privacy', 'Privacy Policy'],
            ['/terms', 'Terms of Service'],
          ].map(([to, label]) => (
            <Link
              key={to}
              to={to}
              className="rounded text-white/60 no-underline hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              {label}
            </Link>
          ))}
        </nav>
        <p className="text-sm text-white/60">
          © {new Date().getFullYear()} WriteReady IELTS. Band scores are AI estimates. WriteReady is not connected to the British
          Council, IDP or Cambridge.
        </p>
      </footer>
      <FaqAnswerStyles />
      <ChatBot />
    </div>
  );
}
