import { Check, Circle, X } from 'lucide-react';
import { PASSWORD_RULES } from '@/lib/passwordRules';
import { cn } from '@/lib/utils';

/**
 * The password rules under a new-password field, each ticked off as the
 * student types. `showUnmet` turns the rules still missing red, after they
 * tried to submit without meeting them. Not a live region: a screen reader
 * hears the list through the field's aria-describedby instead of on every key.
 */
export function PasswordChecklist({ id, password, showUnmet = false, className }: { id: string; password: string; showUnmet?: boolean; className?: string }) {
  return (
    <ul id={id} className={cn('m-0 grid list-none gap-x-4 gap-y-1.5 p-0 text-xs sm:grid-cols-2', className)}>
      {PASSWORD_RULES.map((rule) => {
        const met = rule.pattern.test(password);
        const missed = !met && showUnmet;
        const Icon = met ? Check : missed ? X : Circle;
        return (
          <li
            key={rule.id}
            className={cn(
              'flex items-center gap-1.5 transition-colors duration-150',
              met ? 'text-emerald-700 dark:text-emerald-400' : missed ? 'text-red-600 dark:text-red-400' : 'text-[var(--text-secondary)]',
            )}
          >
            <Icon className={cn('shrink-0', met || missed ? 'size-3.5' : 'size-3')} strokeWidth={met || missed ? 2.5 : 2} aria-hidden="true" />
            <span>
              {rule.label}
              <span className="sr-only">{met ? ' (done)' : ' (still needed)'}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
