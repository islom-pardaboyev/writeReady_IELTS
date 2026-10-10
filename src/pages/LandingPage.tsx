import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, ArrowUpRight, BookOpenCheck, Bot, Building2, Coffee, GraduationCap, PenLine, Send, Timer, Zap } from 'lucide-react';
import { TELEGRAM_BOT_URL, TELEGRAM_CHANNEL_URL } from '@/lib/links';
import { TELEGRAM_CONTACT_URL } from '@/lib/legal';
import { useShowTelegramBot } from '@/hooks/useFeatureFlag';
import { Header } from '@/components/layout/Header';
import { SkipLink } from '@/components/layout/SkipLink';
import { FaqAccordion, FaqAnswerStyles } from '@/components/ui/FaqAccordion';
import { ExamRoomDemo } from '@/components/landing/ExamRoomDemo';
import { PenUnderline } from '@/components/landing/PenUnderline';
import { HOME_QUESTIONS } from '@/lib/faq';
import { ChatBot } from '../components/ui/ChatBot';

// The four bands of the sample report on the first card. The same sample the
// sign-in page shows (src/components/landing/ReportSample.tsx).
const SAMPLE_BANDS: [string, number][] = [
  ['Task Response', 6.5],
  ['Coherence and Cohesion', 7],
  ['Lexical Resource', 6.5],
  ['Grammatical Range', 6],
];

const MODES = [
  {
    title: 'Mock Exam',
    spec: '60 min · Task 1 and 2',
    text: 'Both tasks against one clock, on a screen laid out like the computer-based test.',
    href: '/writing/mock',
    Icon: Timer,
    well: 'bg-brand-600 text-white',
  },
  {
    title: 'Practice',
    spec: 'No timer · Task 1 and 2',
    text: 'Both tasks at your own pace, with a new question whenever you want one.',
    href: '/writing/practice',
    Icon: PenLine,
    well: 'bg-field-mint text-field-ink',
  },
  {
    title: 'Quick Write',
    spec: 'No timer · one task',
    text: 'A single Task 1 or Task 2 question for a short session. Easy to fit into every day.',
    href: '/writing/quick',
    Icon: Zap,
    well: 'bg-field-amber text-field-ink',
  },
  {
    title: 'Relax',
    spec: 'Your own question',
    text: 'Paste any question you like, add a chart if you have one, and write.',
    href: '/writing/relax',
    Icon: Coffee,
    well: 'bg-field-lilac text-field-ink',
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

const WRAP = 'mx-auto max-w-[1280px] px-4 sm:px-6';
const H2 = 'font-display text-[clamp(1.75rem,3.4vw,2.625rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-balance text-[var(--text-primary)]';
const LEAD = 'mt-3 max-w-[56ch] text-lg leading-relaxed text-[var(--text-secondary)]';
// The pill's shape; a pill on a colour field adds its own focus-ring colours.
const PILL_SHAPE =
  'inline-flex h-[54px] items-center justify-center gap-2 rounded-full px-7 text-[1.0625rem] font-bold no-underline transition-[transform,box-shadow,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0';
const PILL = `${PILL_SHAPE} focus-visible:ring-[var(--ring)] focus-visible:ring-offset-[var(--bg-card)]`;
const PILL_PRIMARY = `${PILL} bg-[var(--ink-blue-solid)] text-white shadow-[0_10px_22px_-8px_color-mix(in_srgb,var(--ink-blue-solid)_65%,transparent)] hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-8px_color-mix(in_srgb,var(--ink-blue-solid)_75%,transparent)]`;
const PILL_OUTLINE = `${PILL} border-[1.5px] border-[var(--border-strong)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]`;
const TEXT_LINK = 'font-semibold text-[var(--ink-blue)] no-underline hover:underline';
const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** One part of the report: a colour field holding a piece of the real thing, then what it is. */
function ReportCard({ field, title, text, children }: { field: string; title: string; text: string; children: ReactNode }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <div className={`flex min-h-[272px] flex-1 items-center justify-center px-5 py-7 ${field}`}>
        <div className="w-full rounded-2xl bg-[var(--bg-card)] p-4 text-left shadow-[0_16px_34px_-14px_rgb(20_19_43/0.4)] dark:shadow-[0_16px_34px_-14px_rgb(0_0_0/0.8)]">
          {children}
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <h3 className="font-display text-lg font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">{title}</h3>
        <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">{text}</p>
      </div>
    </li>
  );
}

const CARD_LABEL = 'text-xs font-semibold text-[var(--text-secondary)]';

export function LandingPage() {
  // Admin → Telegram bot: the bot is left off the page until the admin announces it.
  const botShown = useShowTelegramBot();

  return (
    <div className="bg-[var(--bg-card)] font-sans text-[var(--text-primary)] dark:bg-[var(--bg-base)]">
      <SkipLink />
      <Header />

      <main id="main-content" tabIndex={-1} className="outline-none">
        {/* ── Hero ── */}
        <section aria-labelledby="hero-title" className={`${WRAP} pt-14 text-center sm:pt-20`}>
          <h1
            id="hero-title"
            className="mx-auto max-w-[17ch] font-display text-[clamp(2.375rem,6vw,4.25rem)] font-extrabold leading-[1.05] tracking-[-0.035em] text-balance text-[var(--text-primary)] sm:max-w-none"
          >
            <span className="sm:block">Write your IELTS essay.</span>{' '}
            <span className="sm:block">Find out which sentences</span>{' '}
            <span className="relative inline-block whitespace-nowrap">
              cost you marks.
              <PenUnderline />
            </span>
          </h1>
          <p className="mx-auto mt-8 max-w-[46ch] text-lg leading-relaxed text-pretty text-[var(--text-secondary)] sm:text-[1.1875rem]">
            Get an estimated band for your Task 1 or Task 2 answer, with a note on every sentence and better words in Uzbek.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link to="/auth?mode=signup" className={PILL_PRIMARY}>
              Check my essay
              <ArrowRight className="size-[1.125rem]" aria-hidden="true" />
            </Link>
            <Link to="/writing/mock" className={PILL_OUTLINE}>
              Try a mock exam
            </Link>
          </div>
          <p className="mt-5 text-sm text-[var(--text-secondary)]">Free: one band report every week.</p>
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
        </section>

        {/* ── What the report holds: four pieces of a sample report ── */}
        <section aria-labelledby="report-title" className={`${WRAP} pt-12 pb-20 sm:pt-14 lg:pb-24`}>
          <h2 id="report-title" className="sr-only">What comes back when you finish</h2>
          <ul className="m-0 grid list-none gap-5 p-0 sm:grid-cols-2 xl:grid-cols-4">
            <ReportCard field="bg-brand-600" title="Four band scores" text="One for each IELTS criterion, with the reason.">
              <div className="flex items-end justify-between gap-3 border-b border-[var(--border-color)] pb-2.5">
                <div className="min-w-0">
                  <p className={CARD_LABEL}>Task 2 · Opinion essay</p>
                  <p className="mt-0.5 text-[0.8125rem] font-bold text-[var(--text-primary)]">Estimated overall band</p>
                </div>
                <p className="font-mono text-4xl font-semibold leading-none tracking-[-0.04em] text-[var(--text-primary)] tabular-nums">6.5</p>
              </div>
              <dl className="m-0">
                {SAMPLE_BANDS.map(([name, band]) => (
                  <div key={name} className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_3.25rem] items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                    <dt>{name}</dt>
                    <dd className="m-0 font-mono tabular-nums">{band.toFixed(1)}</dd>
                    <span aria-hidden="true" className="h-[5px] overflow-hidden rounded-full bg-[var(--border-color)] dark:bg-[var(--border-strong)]">
                      <span className="block h-full rounded-full bg-brand-600 dark:bg-brand-400" style={{ width: `${(band / 9) * 100}%` }} />
                    </span>
                  </div>
                ))}
              </dl>
            </ReportCard>

            <ReportCard field="bg-field-amber" title="Notes on every sentence" text="Where you lost marks, and a better way to write it.">
              <p className={CARD_LABEL}>Sentence 2 · Grammar</p>
              <p className="mt-2 text-sm leading-snug text-red-600 line-through decoration-1 dark:text-red-400">Technology have changed the way we learn.</p>
              <p className="mt-1 text-sm font-bold leading-snug text-emerald-700 dark:text-emerald-400">Technology has changed the way we learn.</p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">"Technology" is one thing, so the verb is singular.</p>
            </ReportCard>

            <ReportCard field="bg-field-mint" title="Up to 15 better words" text="Taken from your essay, with Uzbek meanings.">
              <p className={CARD_LABEL}>Better word</p>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[0.9375rem] text-[var(--text-secondary)]">
                dramatically
                <ArrowRight className="size-3.5 translate-y-0.5" aria-hidden="true" />
                <span className="sr-only">becomes</span>
                <span className="font-display text-xl font-extrabold text-[var(--text-primary)]">profoundly</span>
              </p>
              <p className="mt-2.5 inline-block rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                Uzbek: tubdan
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">"has profoundly changed the way we learn"</p>
            </ReportCard>

            <ReportCard field="bg-field-lilac" title="A band 8 to 9 answer" text="The same question, written at a higher band.">
              <p className="inline-block rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
                Sample answer · Band 8 to 9
              </p>
              <p className="mt-2.5 text-sm leading-relaxed text-[var(--text-primary)]">
                Online study suits learners who can follow a plan without a teacher watching, which is why its results vary so widely.
              </p>
            </ReportCard>
          </ul>
          <p className="mx-auto mt-8 max-w-[70ch] text-center text-sm leading-relaxed text-[var(--text-secondary)]">
            The cards show parts of a sample report. A full report also has up to 10 grammar points and the three fixes to make
            first. The free report shows the four bands, and the rest comes with a paid plan.{' '}
            <Link to="/pricing" className={TEXT_LINK}>
              See the plans
            </Link>
          </p>
        </section>

        {/* ── The exam screen, and an answer being marked ── */}
        <section aria-labelledby="demo-title" className="bg-tint">
          <div className={`${WRAP} py-20 lg:py-24`}>
            <h2 id="demo-title" className={H2}>See an answer get marked</h2>
            <p className={LEAD}>This is the Mock Exam screen. A sample answer is typed in, then marked the way yours will be.</p>
            <div className="mt-10">
              <ExamRoomDemo />
            </div>
          </div>
        </section>

        {/* ── Modes ── */}
        <section aria-labelledby="modes-title" className={`${WRAP} py-20 lg:py-24`}>
          <h2 id="modes-title" className={H2}>Four ways to practise</h2>
          <p className={LEAD}>All four use the same marking. Pick the one that fits the time you have today.</p>
          <ul className="m-0 mt-10 grid list-none gap-5 p-0 sm:grid-cols-2 xl:grid-cols-4">
            {MODES.map(({ title, spec, text, href, Icon, well }) => (
              <li key={title}>
                <Link
                  to={href}
                  className="group flex h-full flex-col rounded-3xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 no-underline transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)] motion-reduce:hover:translate-y-0"
                >
                  <span className={`grid size-12 place-items-center rounded-2xl ${well}`}>
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 font-display text-xl font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">{title}</h3>
                  <p className="mt-1 text-[0.8125rem] font-semibold text-[var(--text-secondary)]">{spec}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{text}</p>
                  <span className="mt-auto inline-flex items-center gap-1 pt-6 text-sm font-semibold text-[var(--ink-blue)]">
                    Open {title}
                    <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Sample answers: free to read, no account ── */}
        <section aria-labelledby="samples-title" className="px-4 pb-20 sm:px-6 lg:pb-24">
          <div className="mx-auto flex max-w-[1232px] flex-col items-start gap-6 rounded-[32px] bg-field-lilac px-6 py-10 text-field-ink sm:px-10 sm:py-12 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
            <div className="flex items-start gap-5">
              <span className="hidden size-14 shrink-0 place-items-center rounded-2xl bg-[var(--bg-card)] text-[var(--text-primary)] sm:grid">
                <BookOpenCheck className="size-7" aria-hidden="true" />
              </span>
              <div>
                <h2 id="samples-title" className="font-display text-[clamp(1.5rem,3vw,2.125rem)] font-extrabold leading-[1.1] tracking-[-0.03em] text-balance">
                  Read Band 7+ sample answers
                </h2>
                <p className="mt-2 max-w-[56ch] text-base leading-relaxed text-field-ink/80">
                  Real exam questions with answers, each with an outline, vocabulary in Uzbek and grammar notes. Open to everyone,
                  with no account needed.
                </p>
              </div>
            </div>
            <Link
              to="/questions"
              className={`${PILL_SHAPE} w-full shrink-0 bg-field-ink text-field-lilac hover:-translate-y-0.5 focus-visible:ring-field-ink focus-visible:ring-offset-field-lilac sm:w-auto`}
            >
              Browse sample answers
              <ArrowRight className="size-[1.125rem]" aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* ── Beyond the AI ── */}
        <section aria-labelledby="more-title" className="bg-tint">
          <div className={`${WRAP} grid gap-10 py-20 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16 lg:py-24`}>
            <h2 id="more-title" className={H2}>When you want more than the AI</h2>
            <dl className="m-0 flex flex-col divide-y divide-[var(--border-color)] rounded-3xl border border-[var(--border-color)] bg-[var(--bg-card)] px-5 sm:px-7">
              <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 py-6">
                <span className="grid size-12 place-items-center rounded-2xl bg-field-mint text-field-ink">
                  <GraduationCap className="size-6" aria-hidden="true" />
                </span>
                <div>
                  <dt className="font-display text-lg font-extrabold text-[var(--text-primary)]">Human Check</dt>
                  <dd className="m-0 mt-1 max-w-[60ch] text-base leading-relaxed text-[var(--text-secondary)]">
                    A real teacher marks your essay. You see the price before you pay.
                  </dd>
                </div>
              </div>
              {botShown && (
                <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 py-6">
                  <span className="grid size-12 place-items-center rounded-2xl bg-field-lilac text-field-ink">
                    <Bot className="size-6" aria-hidden="true" />
                  </span>
                  <div>
                    <dt className="font-display text-lg font-extrabold text-[var(--text-primary)]">The Telegram bot</dt>
                    <dd className="m-0 mt-1 max-w-[60ch] text-base leading-relaxed text-[var(--text-secondary)]">
                      Send an essay to the bot and get a band score back in the chat. You don't need an account for it.{' '}
                      <a href={TELEGRAM_BOT_URL} {...external} className={TEXT_LINK}>
                        Open the bot<span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    </dd>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 py-6">
                <span className="grid size-12 place-items-center rounded-2xl bg-field-amber text-field-ink">
                  <Building2 className="size-6" aria-hidden="true" />
                </span>
                <div>
                  <dt className="font-display text-lg font-extrabold text-[var(--text-primary)]">For learning centres</dt>
                  <dd className="m-0 mt-1 max-w-[60ch] text-base leading-relaxed text-[var(--text-secondary)]">
                    Buy places for your students and see how much each one practises.{' '}
                    <a href={TELEGRAM_CONTACT_URL} {...external} className={TEXT_LINK}>
                      Ask us about places<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                    {' · '}
                    <Link to="/center-admin" className={TEXT_LINK}>
                      Centre sign-in
                    </Link>
                  </dd>
                </div>
              </div>
            </dl>
          </div>
        </section>

        {/* ── Videos ── */}
        <section aria-labelledby="videos-title" className={`${WRAP} py-20 lg:py-24`}>
          <h2 id="videos-title" className={H2}>See it working</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {DEMO_VIDEOS.map((v) => (
              <div key={v.id} className="overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--bg-card)]">
                <video controls preload="none" poster={v.poster} className="block aspect-video w-full bg-black">
                  <source src={v.src} type="video/mp4" />
                  Your browser can't play this video. <a href={v.src}>Download it</a> instead.
                </video>
                <div className="p-5 sm:p-6">
                  <h3 className="font-display text-lg font-extrabold text-[var(--text-primary)]">{v.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Questions ── */}
        <section aria-labelledby="faq-title" className="mx-auto max-w-[760px] px-4 pb-20 sm:px-6 lg:pb-24">
          <h2 id="faq-title" className={`${H2} mb-8`}>Questions people ask first</h2>
          <FaqAccordion items={HOME_QUESTIONS} />
          <p className="mt-6 text-center text-sm">
            <Link to="/faq" className={`inline-flex items-center gap-1 ${TEXT_LINK}`}>
              All questions and answers
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </p>
        </section>

        {/* ── Close ── */}
        <section aria-labelledby="cta-title" className="px-4 pb-16 sm:px-6 lg:pb-20">
          <div className="mx-auto max-w-[1232px] rounded-[32px] bg-brand-600 px-6 py-16 text-center sm:py-20">
            <h2 id="cta-title" className="mx-auto max-w-[18ch] font-display text-[clamp(1.875rem,4vw,3rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-balance text-white">
              Write one essay today and see your band.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/85">It's free to start. Paid plans give you more reports each month.</p>
            <Link
              to="/auth?mode=signup"
              className={`${PILL_SHAPE} mt-8 bg-white text-brand-700 shadow-[0_10px_22px_-10px_rgb(0_0_0/0.45)] hover:-translate-y-0.5 focus-visible:ring-white focus-visible:ring-offset-brand-600`}
            >
              Create a free account
              <ArrowRight className="size-[1.125rem]" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border-color)] bg-tint px-6 py-8 text-center">
        <div className="mb-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          {[
            { href: TELEGRAM_CHANNEL_URL, label: 'Follow us on Telegram', Icon: Send },
            ...(botShown ? [{ href: TELEGRAM_BOT_URL, label: 'Essay checker bot', Icon: Bot }] : []),
          ].map(({ href, label, Icon }) => (
            <a
              key={href}
              href={href}
              {...external}
              className="group inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold text-[var(--text-primary)] no-underline transition-colors hover:bg-[var(--bg-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
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
            ['/questions', 'Sample answers'],
            ['/faq', 'FAQ'],
            ['/privacy', 'Privacy Policy'],
            ['/terms', 'Terms of Service'],
          ].map(([to, label]) => (
            <Link
              key={to}
              to={to}
              className="rounded text-[var(--text-secondary)] no-underline hover:text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {label}
            </Link>
          ))}
        </nav>
        <p className="text-sm text-[var(--text-secondary)]">
          © {new Date().getFullYear()} WriteReady IELTS. Band scores are AI estimates. WriteReady is not connected to the British
          Council, IDP or Cambridge.
        </p>
      </footer>
      <FaqAnswerStyles />
      <ChatBot />
    </div>
  );
}
