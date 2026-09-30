import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Check, Clock } from 'lucide-react';

/**
 * The home page's first screen, in the margins beside the headline: pieces of a
 * marked report (a correction, a band, a better word with its Uzbek meaning, a
 * fix to tick, the progress chart) drifting back and forth at different depths,
 * with the red and green pen marks an examiner leaves. Every piece is something
 * the product really gives, so the motion shows what the page is about.
 *
 * Only from 1280px, where the centred headline leaves room on both sides;
 * phones keep the plain first screen. The layer tilts a little with the mouse,
 * so nearer pieces move more than far ones. Under reduced motion it stands
 * still. Purely decorative: hidden from screen readers and from the pointer.
 */

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Piece {
  /** Where it sits in the margin, and how far in front of (+) or behind (−) the page, in px. */
  at: CSSProperties;
  z: number;
  /** Its drift: the far end of the back-and-forth, a small turn, and the time one way takes. */
  dx: number;
  dy: number;
  r: number;
  secs: number;
  children: ReactNode;
}

const CARD = 'rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-md)]';
const LABEL = 'm-0 text-[11px] font-semibold text-[var(--text-secondary)]';

/** A hand-drawn red wavy line, like an examiner's underline. */
function Squiggle({ width = 96, className = '' }: { width?: number; className?: string }) {
  const d = Array.from({ length: Math.round(width / 8) }, (_, i) => `q 2 ${i % 2 ? 4 : -4} 4 0 t 4 0`).join(' ');
  return (
    <svg width={width} height="8" viewBox={`0 0 ${width} 8`} className={className} aria-hidden="true">
      <path d={`M 0 4 ${d}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const PIECES: Piece[] = [
  // ── Left margin ──
  {
    at: { left: '4%', top: 88 }, z: 70, dx: 10, dy: -14, r: -5, secs: 6.5,
    children: (
      <div className={`${CARD} w-[228px] px-4 py-3.5`}>
        <p className={LABEL}>Sentence 2 · Grammar</p>
        <p className="m-0 mt-1.5 text-sm leading-snug text-[var(--text-primary)]">
          Technology <span className="relative inline-block text-red-600 dark:text-red-400">have<Squiggle width={30} className="absolute -bottom-1.5 left-0 text-red-500" /></span> changed
        </p>
        <p className="m-0 mt-1 text-sm leading-snug">
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">Technology has changed</span>
        </p>
      </div>
    ),
  },
  {
    at: { left: '12%', top: 262 }, z: -60, dx: -12, dy: 10, r: 4, secs: 8,
    children: (
      <div className={`${CARD} w-[196px] px-4 py-3`}>
        <p className={LABEL}>Coherence &amp; Cohesion</p>
        <div className="mt-2 flex items-center gap-2.5">
          <span className="font-mono text-xl font-semibold leading-none text-[var(--text-primary)] tabular-nums">7.0</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border-color)] dark:bg-[var(--border-strong)]">
            <span className="block h-full w-[78%] rounded-full bg-amber-400" />
          </span>
        </div>
      </div>
    ),
  },
  {
    at: { left: '3.5%', top: 396 }, z: 40, dx: 8, dy: 12, r: -3, secs: 7.2,
    children: (
      <div className={`${CARD} flex w-[218px] items-start gap-2.5 px-3.5 py-3`}>
        <span className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] bg-[var(--ink-blue)] text-white dark:text-[var(--primary-foreground)]">
          <Check className="size-3" strokeWidth={3} />
        </span>
        <span>
          <span className="block text-[11px] font-semibold text-[var(--ink-blue)]">Fix this first</span>
          <span className="block text-[13px] leading-snug text-[var(--text-secondary)] line-through decoration-1">Split long sentences in two</span>
        </span>
      </div>
    ),
  },
  {
    at: { left: '13%', top: 528 }, z: -100, dx: -10, dy: -8, r: 5, secs: 9,
    children: (
      <div className={`${CARD} w-[150px] px-3.5 py-2.5`}>
        <p className="m-0 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
          <Clock className="size-3.5 text-[var(--text-secondary)]" />
          <span className="font-mono tabular-nums">38:12</span>
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">left</span>
        </p>
        <span className="mt-2 block h-1 overflow-hidden rounded-full bg-[var(--border-color)] dark:bg-[var(--border-strong)]">
          <span className="block h-full w-[36%] rounded-full bg-[var(--ink-blue)]" />
        </span>
      </div>
    ),
  },
  // A red pen mark, on its own.
  {
    at: { left: '16%', top: 206 }, z: 110, dx: 6, dy: -6, r: -8, secs: 5.5,
    children: <Squiggle width={72} className="text-red-500/80" />,
  },

  // ── Right margin ──
  {
    at: { right: '5%', top: 72 }, z: 90, dx: -8, dy: 14, r: 8, secs: 7,
    children: (
      <div className={`${CARD} relative flex size-[124px] flex-col items-center justify-center rounded-full`}>
        <span aria-hidden="true" className="absolute inset-[7px] rounded-full border border-dashed border-[var(--ink-blue)] opacity-40" />
        <span className="font-mono text-[2.6rem] font-semibold leading-none tracking-[-0.04em] text-[var(--ink-blue)] tabular-nums">7.5</span>
        <span className="mt-1.5 text-[10px] font-medium text-[var(--text-secondary)]">estimated band</span>
      </div>
    ),
  },
  {
    at: { right: '3.5%', top: 236 }, z: 20, dx: 12, dy: -10, r: -4, secs: 8.5,
    children: (
      <div className={`${CARD} w-[206px] px-4 py-3.5`}>
        <p className={LABEL}>Better word</p>
        <p className="m-0 mt-1 text-base font-semibold text-[var(--text-primary)]">profoundly</p>
        <p className="m-0 mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span className="rounded-full bg-[var(--accent)] px-1.5 py-px text-[10px] font-semibold text-[var(--accent-foreground)]">Uzbek</span>
          tubdan
        </p>
        <p className="m-0 mt-1.5 text-[11px] text-[var(--text-secondary)]">instead of: dramatically</p>
      </div>
    ),
  },
  {
    at: { right: '12%', top: 404 }, z: -50, dx: -10, dy: 10, r: 3, secs: 9.5,
    children: (
      <div className={`${CARD} w-[190px] px-4 py-3`}>
        <p className={LABEL}>Your band</p>
        <svg viewBox="0 0 150 46" className="mt-1.5 block w-full" aria-hidden="true">
          <path d="M 6 38 L 54 30 L 100 22 L 144 8" fill="none" stroke="var(--ink-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {[[6, 38], [54, 30], [100, 22], [144, 8]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3" fill="var(--bg-card)" stroke="var(--ink-blue)" strokeWidth="2" />)}
        </svg>
        <p className="m-0 mt-1 flex items-baseline justify-between text-[11px] text-[var(--text-secondary)]">
          <span className="font-mono tabular-nums">6.5</span>
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">+1.0</span>
          <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">7.5</span>
        </p>
      </div>
    ),
  },
  {
    at: { right: '4%', top: 548 }, z: 50, dx: 8, dy: -12, r: -5, secs: 6.8,
    children: (
      <div className={`${CARD} flex items-center gap-2 rounded-full px-3.5 py-2`}>
        <span className="flex size-4 items-center justify-center rounded-full bg-emerald-600 text-white dark:bg-emerald-500">
          <Check className="size-2.5" strokeWidth={3.5} />
        </span>
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">268</span> words
        </span>
      </div>
    ),
  },
  // A green pen tick, on its own.
  {
    at: { right: '15.5%', top: 150 }, z: 100, dx: -5, dy: 8, r: 10, secs: 5.8,
    children: (
      <svg width="34" height="28" viewBox="0 0 34 28" className="text-emerald-500" aria-hidden="true">
        <path d="M 3 15 L 12 24 L 31 3" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function HeroMarks() {
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el || reduced() || !window.matchMedia('(pointer: fine)').matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--ry', `${(x * 9).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${(-y * 7).toFixed(2)}deg`);
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 hidden h-[640px] select-none xl:block" style={{ perspective: '1200px' }}>
      <style>{`
        @keyframes hero-mark-in { from { opacity: 0; transform: translateY(14px) scale(0.96); } to { opacity: 1; transform: none; } }
        @keyframes hero-mark-drift {
          from { transform: translate3d(0, 0, 0) rotate(var(--r)) rotateY(-9deg); }
          to { transform: translate3d(var(--dx), var(--dy), 0) rotate(calc(var(--r) * -0.5)) rotateY(11deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-mark-in, .hero-mark-drift { animation: none !important; }
          .hero-mark-drift { transform: rotate(var(--r)); }
        }
      `}</style>
      <div
        ref={stage}
        className="relative mx-auto h-full max-w-[1440px]"
        style={{ transformStyle: 'preserve-3d', transform: 'rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))', transition: 'transform 400ms cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {PIECES.map((p, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              ...p.at,
              transform: `translateZ(${p.z}px)`,
              transformStyle: 'preserve-3d',
              // Far pieces sit softer, as if out of focus behind the page.
              ...(p.z < 0 ? { opacity: 0.82, filter: 'blur(0.4px)' } : {}),
            }}
          >
            <div className="hero-mark-in" style={{ animation: `hero-mark-in 700ms cubic-bezier(0.16, 1, 0.3, 1) ${200 + i * 90}ms both` }}>
              <div
                className="hero-mark-drift"
                style={{
                  ['--dx' as string]: `${p.dx}px`,
                  ['--dy' as string]: `${p.dy}px`,
                  ['--r' as string]: `${p.r}deg`,
                  animation: `hero-mark-drift ${p.secs}s ease-in-out ${-i * 0.7}s infinite alternate`,
                  willChange: 'transform',
                }}
              >
                {p.children}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
