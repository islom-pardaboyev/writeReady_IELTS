import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import gsap from 'gsap';
import { useAuth } from '../hooks/useAuth';
import { useUsage } from '../hooks/useUsage';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { PasswordInput } from '../components/ui/PasswordInput';

function friendlyAuthError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : fallback;
  const cleaned = msg.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim();
  return cleaned || fallback;
}

const PRO_FEATURES = [
  'Real exam-style prompts',
  'Sentence-by-sentence feedback',
  'Estimated band score per sentence',
  'Full essay report (4 criteria)',
  '15 topic-specific vocabulary words',
  'High-level sample essays',
];


export function AccountPage() {
  const { user, profile, logOut, updateDisplayName, changePassword } = useAuth();
  const { usage } = useUsage(user?.uid ?? null);
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    if (!user) navigate('/auth');
  }, [user]);

  useEffect(() => {
    if (user) setNameInput(user.displayName ?? '');
  }, [user]);

  useLayoutEffect(() => {
    if (!user || !profile) return;
    const ctx = gsap.context(() => {
      gsap.set('.gs-profile-card', { x: -30, opacity: 0 });
      gsap.set('.gs-plan-card', { x: 30, opacity: 0 });
      gsap.set('.gs-edit-card', { y: 20, opacity: 0 });
      gsap.set('.gs-account-actions', { y: 20, opacity: 0 });

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.to('.gs-profile-card', { x: 0, opacity: 1, duration: 0.6 })
        .to('.gs-plan-card', { x: 0, opacity: 1, duration: 0.65 }, '-=0.35')
        .to('.gs-edit-card', { y: 0, opacity: 1, duration: 0.5 }, '-=0.3')
        .to('.gs-account-actions', { y: 0, opacity: 1, duration: 0.5 }, '-=0.3');
    }, rootRef);

    return () => ctx.revert();
  }, [user, profile]);

  if (!user || !profile) return null;

  const isPro = profile.plan === 'basic' || profile.plan === 'standard' || profile.plan === 'premium' || profile.plan === 'forever';
  const isForever = profile.subscription === 'forever' || profile.plan === 'forever';
  const displayName = user.displayName || user.email?.split('@')[0] || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();
  const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');

  const usedCount = usage?.count ?? 0;
  const usageLimit = usage?.limit ?? 12;
  const usagePct = Math.min(100, (usedCount / usageLimit) * 100);

  const handleLogout = async () => {
    await logOut();
    navigate('/');
  };

  const handleSaveName = async (e: FormEvent) => {
    e.preventDefault();
    setNameError(null);
    setNameSuccess(false);
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError('Name cannot be empty.');
      return;
    }
    setSavingName(true);
    try {
      await updateDisplayName(trimmed);
      setNameSuccess(true);
    } catch (err) {
      setNameError(friendlyAuthError(err, 'Could not update your name.'));
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(friendlyAuthError(err, 'Could not update your password.'));
    } finally {
      setSavingPassword(false);
    }
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

          {/* Edit profile */}
          <Card className="gs-edit-card p-6 mb-4">
            <div className="font-fraunces text-lg text-[var(--text-primary)] mb-4">Edit Profile</div>

            <form onSubmit={handleSaveName} className="mb-6">
              <Label htmlFor="displayName">Display name</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <Input
                  id="displayName"
                  value={nameInput}
                  onChange={(e) => { setNameInput(e.target.value); setNameSuccess(false); setNameError(null); }}
                  placeholder="Your name"
                />
                <Button type="submit" size="sm" disabled={savingName || nameInput.trim() === (user.displayName ?? '')}>
                  {savingName ? 'Saving…' : 'Save'}
                </Button>
              </div>
              {nameError && <p className="text-sm text-red-500 mt-2">{nameError}</p>}
              {nameSuccess && <p className="text-sm text-emerald-600 mt-2">Name updated.</p>}
            </form>

            {hasPasswordProvider ? (
              <form onSubmit={handleChangePassword} className="pt-5 border-t border-[var(--border-color)]">
                <div className="text-sm font-semibold text-[var(--text-primary)] mb-3">Change password</div>
                <div className="flex flex-col gap-3">
                  <div>
                    <Label htmlFor="currentPassword">Current password</Label>
                    <PasswordInput
                      id="currentPassword"
                      className="mt-1.5"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <div>
                    <Label htmlFor="newPassword">New password</Label>
                    <PasswordInput
                      id="newPassword"
                      className="mt-1.5"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">Confirm new password</Label>
                    <PasswordInput
                      id="confirmPassword"
                      className="mt-1.5"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                {passwordError && <p className="text-sm text-red-500 mt-3">{passwordError}</p>}
                {passwordSuccess && <p className="text-sm text-emerald-600 mt-3">Password updated.</p>}
                <Button type="submit" size="sm" className="mt-4" disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}>
                  {savingPassword ? 'Updating…' : 'Update password'}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-[var(--text-secondary)] pt-5 border-t border-[var(--border-color)]">
                You signed in with Google, so there's no password to change here.
              </p>
            )}
          </Card>

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
