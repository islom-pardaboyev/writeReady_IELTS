import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'default' | 'outline' | 'destructive';
type Size = 'sm' | 'md' | 'lg' | 'default';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'default', loading, disabled, children, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        {...props}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60',
          {
            'bg-[var(--ink-blue)] text-white hover:opacity-90': variant === 'primary',
            'bg-gray-100 text-gray-900 hover:bg-gray-200': variant === 'secondary',
            'text-[var(--slate)] hover:bg-gray-100': variant === 'ghost',
            'bg-[var(--coral)] text-white hover:opacity-90': variant === 'danger' || variant === 'destructive',
            'bg-[var(--gold)] text-white hover:opacity-90': variant === 'gold',
            'bg-blue-600 text-white hover:bg-blue-700': variant === 'default',
            'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50': variant === 'outline',
          },
          {
            'h-8 px-3 text-xs': size === 'sm',
            'h-10 px-4 py-2 text-sm': size === 'default',
            'px-5 py-2.5 text-sm': size === 'md',
            'px-8 py-3.5 text-base': size === 'lg',
          },
          className,
        )}
      >
        {loading ? <Spinner /> : null}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

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
