import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

// Pieces the dashboard header and My Account share, so a student sees the
// same banner, photo and meters in both places.

/** The ruled lines and margin of an answer sheet, in the student's own ink. */
export function InkBanner({ className = '', children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={`relative overflow-hidden bg-linear-to-br from-brand-500 via-brand-700 to-brand-900 dark:from-brand-700 dark:via-brand-800 dark:to-brand-950 ${className}`}>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_27px,rgb(255_255_255/0.1)_27px,rgb(255_255_255/0.1)_28px)]"
      />
      <div aria-hidden="true" className="absolute inset-y-0 left-[4.75rem] w-px bg-white/30 sm:left-[5.75rem]" />
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(90%_120%_at_88%_0%,rgb(255_255_255/0.24),transparent_60%)]" />
      {children}
    </div>
  );
}

const AVATAR_SIZE = {
  lg: 'size-24 sm:size-28 text-3xl',
  md: 'size-[4.5rem] text-2xl',
} as const;

/** The student's photo, or their initials when there is none (or it fails to load). */
export function ProfileAvatar({ user, name, size = 'lg' }: { user: User; name: string; size?: keyof typeof AVATAR_SIZE }) {
  const [broken, setBroken] = useState(false);
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const frame = `relative shrink-0 overflow-hidden rounded-[18px] ring-4 ring-[var(--bg-card)] shadow-[var(--shadow-md)] ${AVATAR_SIZE[size]}`;

  if (user.photoURL && !broken) {
    return (
      <img
        src={user.photoURL}
        alt=""
        width={112}
        height={112}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={`${frame} bg-[var(--bg-subtle)] object-cover`}
      />
    );
  }
  return (
    <div aria-hidden="true" className={`${frame} grid place-items-center bg-brand-100 font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-200`}>
      {initials || 'W'}
    </div>
  );
}

/** A thin progress bar that grows from empty once, so it reads as progress being made. */
export function Meter({ value, label, className }: { value: number; label: string; className: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  const clamped = (n: number) => Math.max(0, Math.min(1, n));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped(value) * 100)}
      className="h-2 overflow-hidden rounded-full bg-[var(--border-color)] dark:bg-[var(--border-strong)]"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${className}`}
        style={{ width: `${clamped(shown) * 100}%` }}
      />
    </div>
  );
}
