import { useRef, useLayoutEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Link } from 'react-router';
import { ArrowUpRight, Bot, Send } from 'lucide-react';
import { TELEGRAM_BOT_URL, TELEGRAM_CHANNEL_URL } from '@/lib/links';
import { useShowTelegramBot } from '@/hooks/useFeatureFlag';
import { Header } from '@/components/layout/Header';
import { SkipLink } from '@/components/layout/SkipLink';
import { FaqAccordion, FaqAnswerStyles } from '@/components/ui/FaqAccordion';
import { HOME_QUESTIONS } from '@/lib/faq';
import { ChatBot } from '../components/ui/ChatBot';

gsap.registerPlugin(ScrollTrigger);

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  // Admin -> Telegram bot: the bot is left off the page until the admin announces it.
  const botShown = useShowTelegramBot();

  useLayoutEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      gsap.set('.gs-hero-badge', { y: -16, opacity: 0 });
      gsap.set('.gs-hero-title', { y: 40, opacity: 0 });
      gsap.set('.gs-hero-sub', { y: 28, opacity: 0 });
      gsap.set('.gs-hero-ctas', { y: 24, opacity: 0 });
      gsap.set('.gs-hero-bullet', { y: 14, opacity: 0 });
      gsap.set('.gs-hero-right', { x: 50, opacity: 0 });
      gsap.set('.gs-floating-card', { scale: 0.82, opacity: 0 });

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.to('.gs-hero-badge', { y: 0, opacity: 1, duration: 0.5 })
        .to('.gs-hero-title', { y: 0, opacity: 1, duration: 0.72 }, '-=0.3')
        .to('.gs-hero-right', { x: 0, opacity: 1, duration: 0.75, ease: 'power2.out' }, '-=0.55')
        .to('.gs-hero-sub', { y: 0, opacity: 1, duration: 0.6 }, '-=0.45')
        .to('.gs-hero-ctas', { y: 0, opacity: 1, duration: 0.5 }, '-=0.35')
        .to('.gs-hero-bullet', { y: 0, opacity: 1, duration: 0.45, stagger: 0.09 }, '-=0.3')
        .to('.gs-floating-card', { scale: 1, opacity: 1, duration: 0.65, ease: 'back.out(1.6)' }, '-=0.35');

      gsap.from('.gs-stat-item', {
        scrollTrigger: { trigger: '.gs-stats', start: 'top 86%' },
        y: 32, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power2.out',
      });

      gsap.from('.gs-how-header', {
        scrollTrigger: { trigger: '.gs-how', start: 'top 82%' },
        y: 30, opacity: 0, duration: 0.6, ease: 'power2.out',
      });
      gsap.from('.gs-step-card', {
        scrollTrigger: { trigger: '.gs-how', start: 'top 78%' },
        y: 44, opacity: 0, duration: 0.65, stagger: 0.15, ease: 'power2.out',
      });

      gsap.from('.gs-modes-header', {
        scrollTrigger: { trigger: '.gs-modes', start: 'top 82%' },
        y: 30, opacity: 0, duration: 0.6, ease: 'power2.out',
      });
      gsap.from('.gs-mode-card', {
        scrollTrigger: { trigger: '.gs-modes', start: 'top 78%' },
        y: 44, opacity: 0, duration: 0.65, stagger: 0.15, ease: 'power2.out',
      });

      gsap.from('.gs-faq-header', {
        scrollTrigger: { trigger: '.gs-faq', start: 'top 82%' },
        y: 30, opacity: 0, duration: 0.6, ease: 'power2.out',
      });
      gsap.from('.gs-faq-list', {
        scrollTrigger: { trigger: '.gs-faq', start: 'top 78%' },
        y: 40, opacity: 0, duration: 0.65, ease: 'power2.out',
      });

      gsap.from('.gs-cta-content', {
        scrollTrigger: { trigger: '.gs-cta', start: 'top 82%' },
        y: 50, opacity: 0, duration: 0.72, ease: 'power3.out',
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className="font-sans bg-[var(--bg-base)] text-[var(--text-primary)]">

      <SkipLink />

      {/* ── Nav ── */}
      <Header />

      <main id="main-content" tabIndex={-1} className="outline-none">
      {/* ── Hero ── */}
      <section className="max-w-[1160px] mx-auto px-6 pt-20 pb-16 grid grid-cols-2 gap-16 items-center max-[768px]:grid-cols-1">
        {/* Left */}
        <div>
          <div className="gs-hero-badge inline-flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-700 text-[0.75rem] font-bold tracking-[0.06em] uppercase px-[0.875rem] py-[0.35rem] rounded-[20px] mb-7 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-300">
            <span className="w-[6px] h-[6px] rounded-full bg-green-500 inline-block" />
            AI-Powered · Uzbek & English
          </div>

          <h1 className="gs-hero-title text-[clamp(2.25rem,4.5vw,3.25rem)] font-black leading-[1.1] text-[var(--text-primary)] mb-5 tracking-[-0.02em]">
            IELTS Writing{' '}
            <span className="text-brand-600 dark:text-brand-400">Feedback.</span>
            <br />
            Delivered instantly
            <br />
            through AI.
          </h1>

          <p className="gs-hero-sub text-[1.0625rem] text-[var(--text-secondary)] leading-[1.75] mb-8 max-w-[440px]">
            Write against IELTS-style exam prompts and get the essay marked: notes on every sentence, stronger vocabulary with Uzbek meanings, and an estimated band score.
          </p>

          <div className={`gs-hero-ctas flex gap-[0.875rem] items-center flex-wrap ${botShown ? 'mb-4' : 'mb-8'}`}>
            <Link to="/auth?mode=signup" className="inline-flex items-center gap-2 bg-[var(--ink-blue-solid)] text-white font-bold text-[0.9375rem] px-7 py-3 rounded-[50px] no-underline hover:opacity-90 transition-opacity">
              Check My Essay →
            </Link>
            <Link to="/writing/mock" className="inline-flex items-center gap-[0.375rem] text-[var(--text-secondary)] font-semibold text-[0.9375rem] no-underline hover:text-[var(--text-primary)] transition-colors">
              Try a Test →
            </Link>
          </div>
          {/* For a visitor not ready to sign up: the bot checks an essay with no account. */}
          {botShown && <p className="gs-hero-ctas mb-8 text-sm text-[var(--text-secondary)]">
            No account yet?{' '}
            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 rounded font-semibold text-[var(--ink-blue)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Try a free check in our Telegram bot
              <ArrowUpRight size={14} aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </p>}

          <ul className="grid grid-cols-2 gap-x-6 gap-y-2 list-none m-0 p-0">
            {['One free analysis a week', 'No credit card required', 'Exam-style prompts', 'Sentence-level feedback'].map((t) => (
              <li key={t} className="gs-hero-bullet flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <span className="text-green-500 font-bold text-base" aria-hidden="true">✓</span> {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Right — feedback UI mockup */}
        <div className="gs-hero-right relative max-[768px]:hidden">
          <div className="bg-[var(--bg-subtle)] border border-[var(--border-color)] rounded-2xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.08)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-2 mb-4 pb-[0.875rem] border-b border-[var(--border-color)]">
              <div className="w-[10px] h-[10px] rounded-full bg-red-400" />
              <div className="w-[10px] h-[10px] rounded-full bg-amber-400" />
              <div className="w-[10px] h-[10px] rounded-full bg-emerald-400" />
              <span className="ml-auto text-[0.75rem] text-[var(--text-secondary)] font-mono">AI Feedback Report</span>
            </div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">Task 2 — Opinion Essay</span>
              <div className="bg-[var(--ink-blue-solid)] text-white text-[0.8125rem] font-bold px-[0.875rem] py-1 rounded-[20px]">
                Band 7.0
              </div>
            </div>
            <div className="font-serif text-[0.9rem] leading-[2] text-[var(--text-primary)] mb-4 bg-[var(--bg-card)] rounded-lg p-4 border border-[var(--border-color)]">
              <p>
                Technology{' '}
                <span className="underline decoration-red-500 decoration-wavy underline-offset-[3px]">have</span>{' '}
                changed our lives{' '}
                <span className="bg-yellow-100/50 dark:bg-yellow-900/30 rounded-[3px] px-[3px] font-medium">dramatically</span>{' '}
                in recent years.
              </p>
            </div>
            <div className="border-l-[3px] border-red-500 pl-[0.875rem] mb-[0.875rem]">
              <p className="text-[0.8rem] text-red-500 font-semibold mb-[0.125rem]">Grammar</p>
              <p className="text-[0.8rem] text-[var(--text-secondary)]">"Technology" is singular → use "has changed"</p>
            </div>
            <div className="bg-yellow-50/70 border border-yellow-300/25 rounded-lg p-3 dark:bg-yellow-900/20 dark:border-yellow-700/30">
              <div className="flex items-center gap-2 mb-[0.375rem]">
                <span className="text-[0.8rem] font-bold text-amber-800 dark:text-amber-300">dramatically</span>
                <span className="text-[0.75rem] text-[var(--text-secondary)]">→</span>
                <span className="text-[0.8rem] font-semibold text-[var(--text-primary)]">profoundly</span>
              </div>
              <p className="text-[0.75rem] text-[var(--text-secondary)]">Uzbek: keskin darajada · C1 level</p>
            </div>
          </div>

          {/* Floating band card */}
          <div className="gs-floating-card absolute -bottom-5 -right-5 bg-[var(--bg-card)] rounded-xl px-5 py-4 shadow-[var(--shadow-md)] border border-[var(--border-color)] min-w-[160px]">
            <p className="text-[0.7rem] text-[var(--text-secondary)] font-semibold uppercase tracking-[0.06em] mb-1">Criteria scores</p>
            {[['Task Achievement', '7.0'], ['Coherence', '7.5'], ['Lexical Resource', '6.5'], ['Grammar', '7.0']].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 text-[0.8rem] text-[var(--text-secondary)] py-[0.125rem]">
                <span>{k}</span>
                <span className="font-bold text-brand-600 dark:text-brand-400">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="gs-stats bg-[var(--bg-card)] border-t border-b border-[var(--border-color)]">
        <div className="max-w-[1160px] mx-auto px-6 py-10 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          {[
            { value: 'Band 7+', sub: 'Target score', note: 'IELTS Writing' },
            { value: '4', sub: 'Scoring criteria', note: 'TA · CC · LR · GRA' },
            { value: 'Instant', sub: 'AI feedback', note: 'Uzbek & English' },
            { value: '4 modes', sub: 'Practice styles', note: 'Mock · Practice · Quick · Relax' },
          ].map((s) => (
            <div key={s.sub} className="gs-stat-item px-6 py-5">
              <strong className="block text-[1.75rem] font-black text-[var(--text-primary)] tracking-[-0.02em] mb-[0.125rem]">{s.value}</strong>
              <p className="text-[0.8125rem] font-bold text-[var(--text-secondary)] mb-[0.125rem] uppercase tracking-[0.04em] m-0">{s.sub}</p>
              <p className="text-[0.75rem] text-[var(--text-secondary)] m-0">{s.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="gs-how max-w-[1160px] mx-auto px-6 py-20">
        <div className="gs-how-header mb-12">
          <p className="text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-brand-600 dark:text-brand-400 mb-2">Simple process</p>
          <h2 className="text-[clamp(1.75rem,3vw,2.25rem)] font-black text-[var(--text-primary)] tracking-[-0.02em]">Three steps to a higher band</h2>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-6">
          {[
            { n: '01', title: 'Choose your mode', desc: 'Mock exam for pressure, Practice for pace, Quick Write for daily warm-up, or Relax for free writing.' },
            { n: '02', title: 'Write your essay', desc: 'IELTS-style Task 1 and Task 2 prompts, picked at random from our question bank.' },
            { n: '03', title: 'Get AI feedback', desc: 'Sentence-level grammar notes, vocabulary upgrades with Uzbek meanings, and a band score estimate.' },
          ].map((s) => (
            <div key={s.n} className="gs-step-card bg-[var(--bg-card)] rounded-xl p-8 border border-[var(--border-color)]">
              <div className="text-[2.25rem] font-black text-[var(--border-color)] leading-none mb-4 tracking-[-0.02em]">{s.n}</div>
              <h3 className="text-[1.0625rem] font-bold text-[var(--text-primary)] mb-2">{s.title}</h3>
              <p className="text-[0.9rem] text-[var(--text-secondary)] leading-[1.7]">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Modes ── */}
      <section className="gs-modes bg-[var(--bg-card)] border-t border-[var(--border-color)]">
        <div className="max-w-[1160px] mx-auto px-6 py-20">
          <div className="gs-modes-header mb-12">
            <p className="text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-brand-600 dark:text-brand-400 mb-2">Practice modes</p>
            <h2 className="text-[clamp(1.75rem,3vw,2.25rem)] font-black text-[var(--text-primary)] tracking-[-0.02em]">One goal, four ways to train</h2>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
            {[
              { emoji: '⏱', title: 'Mock Exam', tag: 'Exam simulation', desc: '60-minute timer, both Task 1 and Task 2. Laid out like the computer-based test.', dark: true, href: '/writing/mock' },
              { emoji: '✏️', title: 'Practice Mode', tag: 'Targeted improvement', desc: 'No timer pressure. Work through tasks at your own pace with randomly selected prompts.', dark: false, href: '/writing/practice' },
              { emoji: '⚡', title: 'Quick Write', tag: 'Speed training', desc: 'One random task, no timer, instant submission. Great for daily warm-up and building writing habits.', dark: false, tinted: false, href: '/writing/quick' },
              { emoji: '☕', title: 'Relax Mode', tag: 'Free writing', desc: 'Use your own custom prompt. Enter any question you like, optionally upload a chart, and write freely.', dark: false, tinted: true, href: '/writing/relax' },
            ].map((m) => (
              <Link key={m.title} to={m.href} className="no-underline group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-xl block">
                <div
                  className={`gs-mode-card rounded-xl p-8 h-full block cursor-pointer transition-[transform,box-shadow] duration-150 border group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] group-focus-visible:-translate-y-0.5 group-focus-visible:shadow-[0_8px_24px_rgba(0,0,0,0.1)] ${
                    m.dark
                      ? 'bg-brand-900 border-transparent'
                      : m.tinted
                      ? 'bg-brand-50 border-brand-100 dark:bg-brand-900/20 dark:border-brand-800'
                      : 'bg-[var(--bg-base)] border-[var(--border-color)]'
                  }`}
                >
                  <span className="block text-[1.75rem] mb-4" aria-hidden="true">{m.emoji}</span>
                  <p className={`text-[0.7rem] font-bold uppercase tracking-[0.08em] mb-[0.375rem] m-0 ${m.dark ? 'text-white/70' : 'text-[var(--text-secondary)]'}`}>{m.tag}</p>
                  <h3 className={`text-[1.125rem] font-extrabold mb-2 tracking-[-0.01em] ${m.dark ? 'text-white' : 'text-[var(--text-primary)]'}`}>{m.title}</h3>
                  <p className={`text-[0.875rem] leading-[1.7] ${m.dark ? 'text-white/70' : 'text-[var(--text-secondary)]'}`}>{m.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Questions ── */}
      <section className="gs-faq max-w-[760px] mx-auto px-6 py-20">
        <div className="gs-faq-header mb-8">
          <p className="text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-brand-600 dark:text-brand-400 mb-2">
            Before you start
          </p>
          <h2 className="text-[clamp(1.75rem,3vw,2.25rem)] font-black text-[var(--text-primary)] tracking-[-0.02em]">
            Questions people ask first
          </h2>
        </div>
        <div className="gs-faq-list">
          <FaqAccordion items={HOME_QUESTIONS} />
          <p className="mt-5 text-center text-sm text-[var(--text-secondary)]">
            <Link to="/faq" className="font-semibold text-[var(--ink-blue)] no-underline hover:underline">
              All questions and answers →
            </Link>
          </p>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="gs-cta bg-slate-900 px-6 py-20 text-center dark:bg-black">
        <div className="gs-cta-content max-w-[600px] mx-auto">
          <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-black text-white tracking-[-0.02em] mb-4">
            Ready to reach your target band?
          </h2>
          <p className="text-white/55 text-base mb-8 leading-[1.7]">
            Free to start. Upgrade for more AI feedback each month, in Uzbek and English.
          </p>
          <Link to="/auth?mode=signup" className="inline-flex items-center gap-2 bg-[var(--ink-blue-solid)] text-white font-bold text-base px-8 py-[0.875rem] rounded-[50px] no-underline hover:opacity-90 transition-opacity">
            Create Free Account →
          </Link>
        </div>
      </section>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-slate-900 border-t border-white/[0.06] px-6 py-6 text-center dark:bg-black">
        <div className="mb-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          {[
            { href: TELEGRAM_CHANNEL_URL, label: 'Follow us on Telegram', Icon: Send },
            ...(botShown ? [{ href: TELEGRAM_BOT_URL, label: 'Essay checker bot', Icon: Bot }] : []),
          ].map(({ href, label, Icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 no-underline transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <Icon size={15} aria-hidden="true" />
              {label}
              <ArrowUpRight size={14} className="opacity-60 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ))}
        </div>
        <nav aria-label="Legal" className="mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[0.8125rem]">
          <Link to="/faq" className="rounded text-white/60 no-underline hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
            FAQ
          </Link>
          <Link to="/privacy" className="rounded text-white/60 no-underline hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
            Privacy Policy
          </Link>
          <Link to="/terms" className="rounded text-white/60 no-underline hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
            Terms of Service
          </Link>
        </nav>
        <p className="text-[0.8125rem] text-white/60">
          © {new Date().getFullYear()} WriteReady IELTS · AI-powered writing coach
        </p>
      </footer>
      <FaqAnswerStyles />
      <ChatBot />
    </div>
  );
}
