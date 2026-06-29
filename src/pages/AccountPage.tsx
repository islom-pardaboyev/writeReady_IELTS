import { useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import gsap from 'gsap';
import { useAuth } from '../hooks/useAuth';
import { useUsage } from '../hooks/useUsage';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';

const PRO_FEATURES = [
  'Real exam-style prompts',
  'Sentence-by-sentence feedback',
  'Estimated band score per sentence',
  'Full essay report (4 criteria)',
  '15 topic-specific vocabulary words',
  'High-level sample essays',
];


export function AccountPage() {
  const { user, profile, logOut } = useAuth();
  const { usage } = useUsage(user?.uid ?? null);
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) navigate('/auth');
  }, [user]);

  useLayoutEffect(() => {
    if (!user || !profile) return;
    const ctx = gsap.context(() => {
      gsap.set('.gs-profile-card', { x: -30, opacity: 0 });
      gsap.set('.gs-plan-card', { x: 30, opacity: 0 });
      gsap.set('.gs-account-actions', { y: 20, opacity: 0 });

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.to('.gs-profile-card', { x: 0, opacity: 1, duration: 0.6 })
        .to('.gs-plan-card', { x: 0, opacity: 1, duration: 0.65 }, '-=0.35')
        .to('.gs-account-actions', { y: 0, opacity: 1, duration: 0.5 }, '-=0.3');
    }, rootRef);

    return () => ctx.revert();
  }, [user, profile]);

  if (!user || !profile) return null;

  const isPro = profile.plan === 'basic' || profile.plan === 'standard' || profile.plan === 'premium' || profile.plan === 'forever';
  const isForever = profile.subscription === 'forever' || profile.plan === 'forever';
  const displayName = user.displayName || user.email?.split('@')[0] || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

  const usedCount = usage?.count ?? 0;
  const usageLimit = usage?.limit ?? 12;
  const usagePct = Math.min(100, (usedCount / usageLimit) * 100);

  const handleLogout = async () => {
    await logOut();
    navigate('/');
  };

  return (
    <Layout>
      <div ref={rootRef} className="py-12 min-h-[calc(100vh-120px)] bg-[var(--bg-base)]">
        <div className="container mx-auto max-w-[560px] px-6">

          {/* Profile card */}
          <Card className="gs-profile-card p-6 flex items-center gap-[1.125rem] mb-4">
            <Avatar className="w-14 h-14 shrink-0">
              {user.photoURL && <AvatarImage src={user.photoURL} alt={displayName} />}
              <AvatarFallback className="bg-blue-700 text-white font-fraunces text-xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base text-[var(--text-primary)] mb-0.5">
                {user.displayName || displayName}
              </div>
              <div className="text-sm text-[var(--text-secondary)] overflow-hidden text-ellipsis whitespace-nowrap">
                {user.email}
              </div>
            </div>
            {isPro && (
              <Badge variant={isForever ? 'warning' : 'info'} className="shrink-0 uppercase tracking-[0.05em]">
                {isForever ? 'Lifetime' : 'Pro'}
              </Badge>
            )}
          </Card>

          {/* Plan card */}
          {isPro ? (
            <Card className="gs-plan-card bg-gradient-to-br from-slate-900 to-[#1e3a5f] p-8 mb-4 text-white border-0">
              <div className="inline-flex items-center gap-1.5 bg-[rgba(201,144,10,0.2)] border border-[rgba(201,144,10,0.5)] text-yellow-400 text-[0.7rem] font-bold tracking-[0.1em] uppercase px-3 py-1.5 rounded-full mb-4">
                <span>⚡</span> {isForever ? 'LIFETIME' : 'PRO'}
              </div>
              <div className="font-fraunces text-2xl font-extrabold mb-1">
                {isForever ? 'Lifetime Access' : 'Pro Plan'}
              </div>
              <div className="text-sm text-white/50 mb-7">
                {isForever
                  ? 'Never expires — full access forever'
                  : profile.subscription
                    ? `Active until ${new Date(profile.subscription).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                    : 'Active subscription'}
              </div>
              <div className="mb-7">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[0.8125rem] text-white/55">AI analyses used this month</span>
                  <span className="text-[0.8125rem] font-semibold text-white/80 font-mono">{usedCount}/{usageLimit}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-[width] duration-[400ms] ${usagePct >= 85 ? 'bg-red-400' : 'bg-blue-400'}`}
                    style={{ width: `${usagePct}%` }}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                {PRO_FEATURES.map((f) => (
                  <div key={f} className="flex items-center gap-2.5">
                    <div className="w-[18px] h-[18px] rounded-full bg-blue-400/20 border border-blue-400/40 flex items-center justify-center shrink-0">
                      <span className="text-blue-300 text-[0.6rem] font-bold">✓</span>
                    </div>
                    <span className="text-sm text-white/80">{f}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="gs-plan-card p-8 mb-4">
              <div className="font-fraunces text-xl text-[var(--text-primary)] mb-1.5">Free Plan</div>
              <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
                You're on the free plan. Upgrade to Pro to unlock AI feedback, band score estimates, and vocabulary upgrades.
              </p>
              <Link to="/pricing">
                <Button className="bg-blue-700">Upgrade to Pro</Button>
              </Link>
            </Card>
          )}

          {/* Actions */}
          <Card className="gs-account-actions px-6 py-4 flex items-center justify-between">
            <Link to="/writing" className="text-sm text-blue-600 dark:text-blue-400 font-medium">
              Go to Writing →
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-[var(--text-secondary)] hover:text-red-500"
            >
              Sign out
            </Button>
          </Card>

        </div>
      </div>
    </Layout>
  );
}
