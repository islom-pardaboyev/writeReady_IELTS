import type { ReactNode, CSSProperties } from 'react';
import { cn } from '@/lib/cn';

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
  shadow?: boolean;
}

export function Card({ children, style, className, padding = 'md', shadow = true }: CardProps) {
  return (
    <div
      className={cn(
        'bg-[var(--white)] rounded-[var(--radius-lg)] border border-[var(--border)]',
        {
          'p-4': padding === 'sm',
          'p-6': padding === 'md',
          'p-8': padding === 'lg',
          'shadow-[var(--shadow-sm)]': shadow,
        },
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}
