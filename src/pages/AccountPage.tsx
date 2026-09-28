import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import gsap from 'gsap';
import { Check, ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useUsage } from '../hooks/useUsage';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { PasswordInput } from '../components/ui/PasswordInput';
import { ShortcutSettings } from '../components/shortcuts/ShortcutSettings';
import { VerifiedCards } from '../components/ui/VerifiedCards';
import { AppearanceSettings } from '../components/appearance/AppearanceSettings';
import { WritingSettingsCard } from '../components/appearance/WritingSettingsCard';
import { InkBanner, Meter, ProfileAvatar } from '../components/profile/parts';
import { PLAN_INFO, isPaidPlan, planBadgeVariant } from '../lib/plans';
import { hasFreeReportThisWeek } from '../lib/weeklyFree';
import { joinedDate, profileName } from '../lib/profileInfo';

function friendlyAuthError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : fallback;
  const cleaned = msg.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim();
  return cleaned || fallback;
}

const PRO_FEATURES = [
  'Real exam-style prompts',
  'Sentence-by-sentence feedback',
  'Priority fixes and a plan for the next band',
  'Full essay report (4 criteria)',
  'Up to 15 better words for your own essay',
  'High-level sample essays',
];

const longDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const monthYear = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const whole = new Intl.NumberFormat();

// My Account. Who you are and what you have sit in one card on the left
// (sticky on wide screens); the things you change sit in the column beside it.
// On a phone the card comes first and the settings follow.
export function AccountPage() {
  const { user, profile, logOut, updateDisplayName, changePassword, loading: authLoading } = useAuth();
  const { usage } = useUsage(user?.uid ?? null);
  const navigate = useNavigate();
  const { hash } = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const editCardRef = useRef<HTMLDivElement>(null);

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
    // Wait for Firebase Auth to finish rehydrating before deciding the visitor
    // is signed out — otherwise a hard refresh on /account bounces a signed-in
    // user to /auth before their session has a chance to load.
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  // The dashboard's "Edit profile" button lands here. The card only exists
  // once the profile has loaded, so wait for it.
  useEffect(() => {
    if (hash === '#edit-profile' && profile) editCardRef.current?.scrollIntoView({ block: 'start' });
  }, [hash, profile]);

  useEffect(() => {
    if (user) setNameInput(user.displayName ?? '');
  }, [user]);

  useLayoutEffect(() => {
    if (!user || !profile) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.from('.gs-acc-aside', { y: 16, opacity: 0, duration: 0.55, ease: 'power3.out' });
      gsap.from('.gs-acc-section', { y: 16, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.06, delay: 0.08 });
    }, rootRef);

    return () => ctx.revert();
  }, [user, profile]);

  if (!user || !profile) return null;

  const plan = profile.plan ?? 'free';
  const isPro = isPaidPlan(plan);
  const isForever = profile.subscription === 'forever' || plan === 'forever';
  const displayName = profileName(user, profile);
  const joined = joinedDate(user, profile);
  const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');

  const usedCount = usage?.count ?? 0;
  const usageLimit = usage?.limit ?? 0;
  const freeCheckReady = hasFreeReportThisWeek(profile.freeUsage);
  const activeUntil =
    profile.subscriptionExpiresAt ??
    (profile.subscription && profile.subscription !== 'forever' && !isNaN(new Date(profile.subscription).getTime())
      ? new Date(profile.subscription)
      : null);

  const planTitle = isForever ? 'Lifetime access' : `${PLAN_INFO[plan].label} plan`;
  const planStatus = isForever
    ? 'Never expires'
    : isPro
      ? activeUntil
        ? `Active until ${longDate.format(activeUntil)}`
        : 'Active'
      : freeCheckReady
        ? "This week's free check is ready"
        : "This week's free check is used. It comes back on Monday.";

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
    <AppShell>
      <div ref={rootRef} className="min-h-[calc(100vh-120px)] bg-[var(--bg-base)] py-8 sm:py-10">
        <div className="mx-auto max-w-[1120px] px-4 sm:px-6">
          <header className="mb-6 sm:mb-8">
            <h1 className="text-3xl font-extrabold tracking-[-0.025em] text-balance text-[var(--text-primary)]">My account</h1>
            <p className="mt-1.5 text-[var(--text-secondary)]">Your plan, your profile, and how WriteReady looks for you.</p>
          </header>

          <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-8">
            {/* Who you are and what you have */}
            <aside aria-label="Your account" className="gs-acc-aside flex flex-col gap-2 lg:sticky lg:top-6">
              <Card className="overflow-hidden rounded-[18px]">
                <InkBanner className="h-20" />
                <div className="px-5 pb-5">
                  <div className="-mt-9">
                    <ProfileAvatar user={user} name={displayName} size="md" />
                  </div>
                  <h2 className="mt-3 break-words text-lg font-bold leading-snug tracking-[-0.01em] text-[var(--text-primary)]">{displayName}</h2>
                  <p className="truncate text-sm text-[var(--text-secondary)]">
                    {profile.studentLogin ? `@${profile.studentLogin}` : user.email}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge variant={planBadgeVariant(plan)}>{PLAN_INFO[plan].label}</Badge>
                    {profile.founder && (
                      <Badge variant="outline" title="One of our very first customers. Thank you!">Founding student</Badge>
                    )}
                    {profile.centerName && <Badge variant="secondary">{profile.centerName}</Badge>}
                  </div>
                  {joined && <p className="mt-3 text-xs text-[var(--text-secondary)]">Member since {monthYear.format(joined)}</p>}
                </div>

                <section aria-labelledby="acc-plan" className="border-t border-[var(--border-color)] px-5 py-5">
                  <h2 id="acc-plan" className="text-base font-bold text-[var(--text-primary)]">{planTitle}</h2>
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{planStatus}</p>

                  {isPro && usageLimit > 0 && (
                    <div className="mt-4">
                      <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-[var(--text-secondary)]">AI checks this month</span>
                        <span className="font-mono font-medium text-[var(--text-primary)] tabular-nums">
                          {whole.format(usedCount)} <span className="text-[var(--text-secondary)]">/ {whole.format(usageLimit)}</span>
                        </span>
                      </div>
                      <Meter
                        value={usedCount / usageLimit}
                        label="AI checks used this month"
                        className={usedCount / usageLimit >= 0.85 ? 'bg-red-500' : 'bg-brand-600 dark:bg-brand-400'}
                      />
                    </div>
                  )}

                  {isPro ? (
                    <details className="group mt-4">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-sm font-semibold text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 dark:text-brand-400 [&::-webkit-details-marker]:hidden">
                        What's included
                        <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                      </summary>
                      <ul className="mt-3 flex flex-col gap-2">
                        {PRO_FEATURES.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
                            <Check className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <>
                      <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                        A paid plan adds the full report: sentence-by-sentence corrections, vocabulary, grammar points and a
                        model answer.
                      </p>
                      <Button asChild className="mt-4 w-full">
                        <Link to="/pricing" className="no-underline">See paid plans</Link>
                      </Button>
                    </>
                  )}
                </section>

                <section aria-labelledby="acc-balance" className="border-t border-[var(--border-color)] px-5 py-5">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <h2 id="acc-balance" className="text-sm font-medium text-[var(--text-secondary)]">Balance</h2>
                      <p className="mt-1 font-mono text-2xl font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)] tabular-nums">
                        {whole.format(profile.balanceUZS ?? 0)} <span className="text-sm font-medium text-[var(--text-secondary)]">UZS</span>
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/pricing" className="no-underline">Top up</Link>
                    </Button>
                  </div>
                  <p className="mt-2.5 text-xs leading-relaxed text-[var(--text-secondary)]">For Human Check and other pay-per-use features.</p>
                </section>
              </Card>

              <Button
                variant="ghost"
                onClick={handleLogout}
                className="self-start text-[var(--text-secondary)] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              >
                <LogOut aria-hidden="true" />
                Sign out
              </Button>
            </aside>

            {/* What you change */}
            <div className="flex min-w-0 flex-col gap-6">
              <Card id="edit-profile" ref={editCardRef} className="gs-acc-section scroll-mt-6 p-6">
                <h2 className="font-sans text-lg font-bold text-[var(--text-primary)]">Profile</h2>
                <p className="mb-5 mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                  Your name appears on your dashboard, your reports and your score cards.
                </p>

                <form onSubmit={handleSaveName}>
                  <Label htmlFor="displayName">Display name</Label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Input
                      id="displayName"
                      name="displayName"
                      autoComplete="name"
                      value={nameInput}
                      onChange={(e) => { setNameInput(e.target.value); setNameSuccess(false); setNameError(null); }}
                      placeholder="Your name…"
                      className="max-w-md"
                    />
                    <Button type="submit" disabled={savingName || nameInput.trim() === (user.displayName ?? '')}>
                      {savingName ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                  <div aria-live="polite">
                    {nameError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{nameError}</p>}
                    {nameSuccess && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">Name updated.</p>}
                  </div>
                </form>

                <div className="mt-6 border-t border-[var(--border-color)] pt-5">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Password</h3>
                  {hasPasswordProvider ? (
                    <form onSubmit={handleChangePassword} className="mt-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <Label htmlFor="currentPassword">Current password</Label>
                          <PasswordInput
                            id="currentPassword"
                            name="currentPassword"
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
                            name="newPassword"
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
                            name="confirmPassword"
                            className="mt-1.5"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                          />
                        </div>
                      </div>
                      <div aria-live="polite">
                        {passwordError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{passwordError}</p>}
                        {passwordSuccess && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">Password updated.</p>}
                      </div>
                      <Button
                        type="submit"
                        variant="outline"
                        className="mt-4"
                        disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                      >
                        {savingPassword ? 'Updating…' : 'Update password'}
                      </Button>
                    </form>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      You signed in with Google, so there's no password to change here.
                    </p>
                  )}
                </div>
              </Card>

              <VerifiedCards className="gs-acc-section" />
              <AppearanceSettings className="gs-acc-section" />
              <WritingSettingsCard className="gs-acc-section" />
              <ShortcutSettings className="gs-acc-section" />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
