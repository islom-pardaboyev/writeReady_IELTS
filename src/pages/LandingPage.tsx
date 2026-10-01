import { Link } from 'react-router';
import { ArrowRight, ArrowUpRight, Bot, Building2, Coffee, GraduationCap, PenLine, Send, Timer, Zap } from 'lucide-react';
import { TELEGRAM_BOT_URL, TELEGRAM_CHANNEL_URL } from '@/lib/links';
import { TELEGRAM_CONTACT_URL } from '@/lib/legal';
import { useShowTelegramBot } from '@/hooks/useFeatureFlag';
import { Header } from '@/components/layout/Header';
import { SkipLink } from '@/components/layout/SkipLink';
import { FaqAccordion, FaqAnswerStyles } from '@/components/ui/FaqAccordion';
import { ExamRoomDemo } from '@/components/landing/ExamRoomDemo';
import { ReportSample } from '@/components/landing/ReportSample';
import { HeroMarks } from '@/components/landing/HeroMarks';
import { HOME_QUESTIONS } from '@/lib/faq';
import { ChatBot } from '../components/ui/ChatBot';

// What a full report holds, in the order it is laid out (the FAQ answer
// "Why is this better than just asking ChatGPT?" names the same parts).
const REPORT_PARTS = [
  { title: 'Four band scores', text: 'One for each IELTS criterion, with the reason.' },
  { title: 'Notes on every sentence', text: 'Where you lost marks, and a better way to write it.' },
  { title: 'Up to 15 better words', text: 'Taken from your essay, with Uzbek meanings.' },
  { title: 'Up to 10 grammar points', text: 'Mistakes to fix and structures to add.' },
  { title: 'A band 8 to 9 answer', text: 'The same question, written at a higher band.' },
  { title: 'Three fixes to make first', text: 'The changes that will lift your band most.' },
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
            className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_35px,var(--border-color)_35px,var(--border-color)_36px)] opacity-60 [mask-image:linear-gradient(to_bottom,black_15%,transparent)]"
          />
          {/* Pieces of a marked report drifting in the margins, from 1280px */}
          <HeroMarks />
          <div className="relative mx-auto max-w-[1160px] px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:pb-28 lg:pt-28">
            {/* The text block is centred and given room, so the exam frame
                below is the one busy thing in the first screen. */}
            <div className="mx-auto max-w-[820px] text-center">
              <h1
                id="hero-title"
                className="text-[clamp(2.25rem,4.4vw,3.6rem)] font-extrabold leading-[1.06] tracking-[-0.035em] text-balance text-[var(--text-primary)]"
              >
                <span className="sm:block">Write your IELTS essay.</span>{' '}
                <span className="sm:block">
                  Find out which sentences <span className="text-brand-600 dark:text-brand-400">cost you marks.</span>
                </span>
              </h1>
              <p className="mx-auto mt-7 max-w-[46ch] text-lg leading-relaxed text-pretty text-[var(--text-secondary)]">
                Get an estimated band for your Task 1 or Task 2 answer, with a note on every sentence and better words in Uzbek.
              </p>
              <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Link
                  to="/auth?mode=signup"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--ink-blue-solid)] px-7 text-base font-semibold text-white no-underline transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
                >
                  Check my essay
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/writing/mock"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] px-6 text-base font-semibold text-[var(--text-primary)] no-underline transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
                >
                  Try a mock exam
                </Link>
              </div>
              <p className="mt-6 text-sm text-[var(--text-secondary)]">Free: one band report every week.</p>
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

            <div className="mt-16 sm:mt-20 lg:mt-24">
              <ExamRoomDemo />
            </div>
          </div>
        </section>

        {/* ── What the report holds ── */}
        <section aria-labelledby="report-title" className="mx-auto max-w-[1160px] px-4 py-20 sm:px-6 lg:py-24">
          <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-16">
            <div>
              <h2 id="report-title" className={H2}>What comes back when you finish</h2>
              <dl className="m-0 mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                {REPORT_PARTS.map((p) => (
                  <div key={p.title} className="border-t border-[var(--border-color)] pt-4">
                    <dt className="text-base font-bold text-[var(--text-primary)]">{p.title}</dt>
                    <dd className="m-0 mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">{p.text}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-8 text-sm text-[var(--text-secondary)]">
                The free report shows the four bands. The rest comes with a paid plan.{' '}
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
            </div>
            <dl className="m-0 flex flex-col">
              <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 border-t border-[var(--border-color)] py-6">
                <GraduationCap className="size-6 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                <div>
                  <dt className="text-lg font-bold text-[var(--text-primary)]">Human Check</dt>
                  <dd className="m-0 mt-1.5 max-w-[60ch] text-base leading-relaxed text-[var(--text-secondary)]">
                    A real teacher marks your essay. You see the price before you pay.
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
                    Buy places for your students and see how much each one practises.{' '}
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
