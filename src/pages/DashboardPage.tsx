import { useLayoutEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAuth } from '../contexts/AuthContext';
import { useUsage } from '../hooks/useUsage';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';

gsap.registerPlugin(ScrollTrigger);

const modes = [
  { id: 'mock', emoji: '⏱', title: 'Mock Exam', desc: '60-min timer · Exam simulation' },
  { id: 'practice', emoji: '✏️', title: 'Practice', desc: 'No timer · Build your skills' },
  { id: 'relax', emoji: '☕', title: 'Relax', desc: 'Your prompt · Write freely' },
];

export function DashboardPage() {
  const { user, profile } = useAuth();
  const { usage } = useUsage(user?.uid ?? null);
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set('.gs-db-welcome', { y: 28, opacity: 0 });
      gsap.set('.gs-db-quota', { y: 20, opacity: 0 });
      gsap.set('.gs-db-mode-card', { y: 32, opacity: 0 });

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.to('.gs-db-welcome', { y: 0, opacity: 1, duration: 0.6 })
        .to('.gs-db-quota', { y: 0, opacity: 1, duration: 0.5 }, '-=0.3')
        .to('.gs-db-mode-card', { y: 0, opacity: 1, duration: 0.5, stagger: 0.1 }, '-=0.25');

      gsap.from('.gs-db-question', {
        scrollTrigger: { trigger: '.gs-db-questions', start: 'top 85%' },
        y: 24, opacity: 0, duration: 0.45, stagger: 0.08, ease: 'power2.out',
      });

      gsap.from('.gs-db-upsell', {
        scrollTrigger: { trigger: '.gs-db-upsell', start: 'top 88%' },
        y: 36, opacity: 0, duration: 0.65, ease: 'power3.out',
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  const isPro = profile?.plan === 'pro' || profile?.plan === 'forever';
  const usedCount = usage?.count ?? 0;
  const usageLimit = usage?.limit ?? 12;
  const usagePct = Math.min(100, (usedCount / usageLimit) * 100);
  const remaining = usageLimit - usedCount;

  return (
    <Layout>
      <div className="py-10">
        <div className="container mx-auto" ref={rootRef}>

          {/* Welcome header */}
          <div className="gs-db-welcome mb-8">
            <h1 className="font-fraunces text-4xl font-extrabold text-slate-900 mb-1.5">
              Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
            </h1>
            <p className="text-slate-500">
              {isPro
                ? `${remaining} AI analyses remaining this month`
                : 'Free plan — upgrade to unlock AI feedback'}
            </p>
          </div>

          {/* Quota bar for pro users */}
          {isPro && usage && (
            <div className="gs-db-quota bg-white rounded-2xl px-6 py-5 border border-slate-200 shadow-sm mb-8">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-[0.9375rem] text-slate-900">Monthly AI Feedback Quota</span>
                <span className={`font-mono text-[0.9375rem] font-medium ${usagePct >= 85 ? 'text-red-500' : 'text-blue-700'}`}>
                  {usedCount}/{usageLimit}
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${usagePct >= 85 ? 'bg-red-500' : 'bg-blue-700'}`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            </div>
          )}

          {/* Mode picker */}
          <h2 className="text-xl font-bold text-slate-900 mb-4">Choose a practice mode</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-10">
            {modes.map((m) => (
              <button
                key={m.id}
                className={`gs-db-mode-card rounded-[14px] p-6 text-left cursor-pointer transition-[transform,box-shadow] duration-150 shadow-sm border-[1.5px] ${
                  m.id === 'mock'
                    ? 'bg-blue-700 border-transparent'
                    : m.id === 'relax'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-white border-slate-200'
                }`}
                onClick={() => navigate(`/writing/${m.id}`)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = '';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '';
                }}
              >
                <div className="text-[1.75rem] mb-2">{m.emoji}</div>
                <div className={`font-fraunces text-lg font-bold mb-1 ${m.id === 'mock' ? 'text-white' : 'text-slate-900'}`}>
                  {m.title}
                </div>
                <div className={`text-[0.8125rem] ${m.id === 'mock' ? 'text-white/75' : 'text-slate-500'}`}>
                  {m.desc}
                </div>
              </button>
            ))}
          </div>

          {!isPro && (
            <div className="gs-db-upsell mt-12 bg-gradient-to-br from-slate-900 to-[#1e3a5f] rounded-2xl p-8 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="font-fraunces text-white mb-1.5 text-xl">
                  Unlock AI Feedback
                </h3>
                <p className="text-white/65 text-[0.9375rem] m-0">
                  Get sentence-level corrections, vocabulary upgrades, and a band score estimate.
                </p>
              </div>
              <Link to="/pricing">
                <Button className="bg-[#c9900a] shrink-0">
                  Upgrade to Pro
                </Button>
              </Link>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}
