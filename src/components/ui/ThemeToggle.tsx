import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className='relative z-[400]'>
        <button
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer outline-none"
          aria-label="Toggle theme"
        >
          {resolvedTheme === 'dark' ? (
            <Moon className="w-4 h-4" />
          ) : (
            <Sun className="w-4 h-4" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-36 bg-[var(--bg-card)] border-[var(--border-color)]">
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className={`gap-2 cursor-pointer text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] ${theme === 'light' ? 'font-semibold' : ''}`}
        >
          <Sun className="w-4 h-4" />
          Light
          {theme === 'light' && <span className="ml-auto text-[var(--ink-blue)]">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className={`gap-2 cursor-pointer text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] ${theme === 'dark' ? 'font-semibold' : ''}`}
        >
          <Moon className="w-4 h-4" />
          Dark
          {theme === 'dark' && <span className="ml-auto text-[var(--ink-blue)]">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('system')}
          className={`gap-2 cursor-pointer text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] ${theme === 'system' ? 'font-semibold' : ''}`}
        >
          <Monitor className="w-4 h-4" />
          System
          {theme === 'system' && <span className="ml-auto text-[var(--ink-blue)]">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
