import { useRef, useLayoutEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Header } from '@/components/layout/Header';
import { ChatBot } from '../components/ui/ChatBot';
import { AnnouncementPopup } from '../components/ui/AnnouncementPopup';

gsap.registerPlugin(ScrollTrigger);

export function LandingPage() {
  useAuth();
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
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

      gsap.from('.gs-cta-content', {
        scrollTrigger: { trigger: '.gs-cta', start: 'top 82%' },
        y: 50, opacity: 0, duration: 0.72, ease: 'power3.out',
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className="font-sans bg-[var(--bg-base)] text-[var(--text-primary)]">

      {/* ── Nav ── */}
      <Header />
      <AnnouncementPopup />

      {/* ── Hero ── */}
      <section className="max-w-[1160px] mx-auto px-6 pt-20 pb-16 grid grid-cols-2 gap-16 items-center max-[768px]:grid-cols-1">
        {/* Left */}
        <div>
          <div className="gs-hero-badge inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-[0.75rem] font-bold tracking-[0.06em] uppercase px-[0.875rem] py-[0.35rem] rounded-[20px] mb-7 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300">
            <span className="w-[6px] h-[6px] rounded-full bg-green-500 inline-block" />
            AI-Powered · Uzbek & English
          </div>

          <h1 className="gs-hero-title text-[clamp(2.25rem,4.5vw,3.25rem)] font-black leading-[1.1] text-[var(--text-primary)] mb-5 tracking-[-0.02em]">
            IELTS Writing{' '}
            <span className="text-blue-600 dark:text-blue-400">Feedback.</span>
            <br />
            Delivered instantly
            <br />
            through AI.
          </h1>

          <p className="gs-hero-sub text-[1.0625rem] text-[var(--text-secondary)] leading-[1.75] mb-8 max-w-[440px]">
            WriteReady combines real IELTS exam prompts with AI to deliver sentence-level feedback, vocabulary upgrades, and a band score — in both Uzbek and English.
          </p>

          <div className="gs-hero-ctas flex gap-[0.875rem] items-center mb-8 flex-wrap">
            <Link to="/auth?mode=signup" className="inline-flex items-center gap-2 bg-[var(--ink-blue)] text-white font-bold text-[0.9375rem] px-7 py-3 rounded-[50px] no-underline hover:opacity-90 transition-opacity">
              Check My Essay →
            </Link>
            <Link to="/writing/mock" className="inline-flex items-center gap-[0.375rem] text-[var(--text-secondary)] font-semibold text-[0.9375rem] no-underline hover:text-[var(--text-primary)] transition-colors">
              Try a Test →
            </Link>
          </div>

          <ul className="grid grid-cols-2 gap-x-6 gap-y-2 list-none m-0 p-0">
            {['First analysis free', 'No credit card required', 'Real exam-style prompts', 'Sentence-level feedback'].map((t) => (
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
              <div className="bg-[var(--ink-blue)] text-white text-[0.8125rem] font-bold px-[0.875rem] py-1 rounded-[20px]">
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
              <p className="text-[0.75rem] text-[var(--text-secondary)]">O'zbek: keskin darajada · C1 level</p>
            </div>
          </div>

          {/* Floating band card */}
          <div className="gs-floating-card absolute -bottom-5 -right-5 bg-[var(--bg-card)] rounded-xl px-5 py-4 shadow-[var(--shadow-md)] border border-[var(--border-color)] min-w-[160px]">
            <p className="text-[0.7rem] text-[var(--text-secondary)] font-semibold uppercase tracking-[0.06em] mb-1">Criteria scores</p>
            {[['Task Achievement', '7.0'], ['Coherence', '7.5'], ['Lexical Resource', '6.5'], ['Grammar', '7.0']].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 text-[0.8rem] text-[var(--text-secondary)] py-[0.125rem]">
                <span>{k}</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{v}</span>
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
              <p className="text-[0.75rem] text-[var(--text-secondary)] opacity-60 m-0">{s.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="gs-how max-w-[1160px] mx-auto px-6 py-20">
        <div className="gs-how-header mb-12">
          <p className="text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-blue-600 dark:text-blue-400 mb-2">Simple process</p>
          <h2 className="text-[clamp(1.75rem,3vw,2.25rem)] font-black text-[var(--text-primary)] tracking-[-0.02em]">Three steps to a higher band</h2>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-6">
          {[
            { n: '01', title: 'Choose your mode', desc: 'Mock exam for pressure, Practice for pace, Quick Write for daily warm-up, or Relax for free writing.' },
            { n: '02', title: 'Write your essay', desc: 'Real IELTS Task 1 and Task 2 prompts, selected randomly from our exam bank.' },
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
            <p className="text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-blue-600 dark:text-blue-400 mb-2">Practice modes</p>
            <h2 className="text-[clamp(1.75rem,3vw,2.25rem)] font-black text-[var(--text-primary)] tracking-[-0.02em]">One goal, four ways to train</h2>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
            {[
              { emoji: '⏱', title: 'Mock Exam', tag: 'Exam simulation', desc: '60-minute timer, both Task 1 and Task 2. Mirrors the real IELTS on-computer experience.', dark: true, href: '/writing/mock' },
              { emoji: '✏️', title: 'Practice Mode', tag: 'Targeted improvement', desc: 'No timer pressure. Work through tasks at your own pace with randomly selected prompts.', dark: false, href: '/writing/practice' },
              { emoji: '⚡', title: 'Quick Write', tag: 'Speed training', desc: 'One random task, no timer, instant submission. Great for daily warm-up and building writing habits.', dark: false, tinted: false, href: '/writing/quick' },
              { emoji: '☕', title: 'Relax Mode', tag: 'Free writing', desc: 'Use your own custom prompt. Enter any question you like, optionally upload a chart, and write freely.', dark: false, tinted: true, href: '/writing/relax' },
            ].map((m) => (
              <Link key={m.title} to={m.href} className="no-underline">
                <div
                  className={`gs-mode-card rounded-xl p-8 h-full block cursor-pointer transition-[transform,box-shadow] duration-150 border ${
                    m.dark
                      ? 'bg-[#1e3a5f] border-transparent dark:bg-blue-900'
                      : m.tinted
                      ? 'bg-blue-50 border-blue-100 dark:bg-blue-900/20 dark:border-blue-800'
                      : 'bg-[var(--bg-base)] border-[var(--border-color)]'
                  }`}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
                >
                  <span className="block text-[1.75rem] mb-4" aria-hidden="true">{m.emoji}</span>
                  <p className={`text-[0.7rem] font-bold uppercase tracking-[0.08em] mb-[0.375rem] m-0 ${m.dark ? 'text-white/50' : 'text-[var(--text-secondary)]'}`}>{m.tag}</p>
                  <h3 className={`text-[1.125rem] font-extrabold mb-2 tracking-[-0.01em] ${m.dark ? 'text-white' : 'text-[var(--text-primary)]'}`}>{m.title}</h3>
                  <p className={`text-[0.875rem] leading-[1.7] ${m.dark ? 'text-white/70' : 'text-[var(--text-secondary)]'}`}>{m.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="gs-cta bg-slate-900 px-6 py-20 text-center dark:bg-slate-950">
        <div className="gs-cta-content max-w-[600px] mx-auto">
          <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-black text-white tracking-[-0.02em] mb-4">
            Ready to reach your target band?
          </h2>
          <p className="text-white/55 text-base mb-8 leading-[1.7]">
            Free to start. Upgrade for unlimited AI feedback in Uzbek and English.
          </p>
          <Link to="/auth?mode=signup" className="inline-flex items-center gap-2 bg-[#c9900a] text-white font-bold text-base px-8 py-[0.875rem] rounded-[50px] no-underline hover:opacity-90 transition-opacity">
            Create Free Account →
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-slate-900 border-t border-white/[0.06] px-6 py-6 text-center dark:bg-slate-950">
        <p className="text-[0.8125rem] text-white/30">
          © {new Date().getFullYear()} WriteReady IELTS · AI-powered writing coach
        </p>
      </footer>
      <ChatBot />
    </div>
  );
}
