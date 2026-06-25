import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      style={{
        fontWeight: 600,
        borderRadius: 'var(--radius)',
        transition: 'all 0.15s',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        justifyContent: 'center',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.6 : 1,
        backgroundColor: variant === 'primary' ? 'var(--ink-blue)'
          : variant === 'danger' ? 'var(--coral)'
          : variant === 'gold' ? 'var(--gold)'
          : 'transparent',
        color: ['primary', 'danger', 'gold'].includes(variant) ? '#fff' : variant === 'secondary' ? 'var(--ink-blue)' : 'var(--slate)',
        border: variant === 'secondary' ? '1.5px solid var(--ink-blue)' : 'none',
        padding: size === 'sm' ? '0.375rem 0.75rem' : size === 'lg' ? '0.875rem 2rem' : '0.625rem 1.25rem',
        fontSize: size === 'lg' ? '1rem' : size === 'sm' ? '0.8125rem' : '0.875rem',
      }}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      style={{ animation: 'spin 0.8s linear infinite', width: 14, height: 14 }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
