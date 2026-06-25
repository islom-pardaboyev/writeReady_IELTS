import type { ReactNode, CSSProperties } from 'react';

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
  shadow?: boolean;
}

export function Card({ children, style, className, padding = 'md', shadow = true }: CardProps) {
  const paddings = { sm: '1rem', md: '1.5rem', lg: '2rem' };
  return (
    <div
      className={className}
      style={{
        background: 'var(--white)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        padding: paddings[padding],
        boxShadow: shadow ? 'var(--shadow-sm)' : 'none',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
