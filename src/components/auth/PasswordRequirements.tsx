import { Check, CircleCheck, Circle, X } from 'lucide-react';
import { PASSWORD_RULES, unmetPasswordRules } from '@/lib/passwordRules';
import { cn } from '@/lib/utils';

/**
 * What a new password needs, said only as loudly as it has to be
 * (.impeccable/surfaces/src-pages-authpage-tsx.md):
 *
 *  - nothing typed yet: one hint line;
 *  - typed, but a rule is missed: a strength bar and the five rules, met ones ticked;
 *  - every rule met: one "Strong password" line.
 *
 * `showUnmet` is set after the form was sent too early: the missing rules turn
 * red and a line under the field says so. Give the field
 * aria-describedby={id} so a screen reader reads whichever of these is shown.
 */
export function PasswordRequirements({
  id,
  password,
  showUnmet = false,
  className,
}: {
  id: string;
  password: string;
  showUnmet?: boolean;
  className?: string;
}) {
  const unmet = unmetPasswordRules(password);
  const met = PASSWORD_RULES.length - unmet.length;

  if (!password && !showUnmet) {
    return (
      <p id={id} className={cn('text-xs leading-relaxed text-[var(--text-secondary)]', className)}>
        Use 8 or more characters with a capital letter, a number and a symbol.
      </p>
    );
  }

  if (unmet.length === 0) {
    return (
      <p id={id} className={cn('flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400', className)}>
        <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
        Strong password
      </p>
    );
  }

  const weak = met <= 2;
  const word = weak ? 'Too weak' : met === 3 ? 'Getting there' : 'Almost there';
  const tone = weak ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400';
  const fill = weak ? 'bg-red-500 dark:bg-red-400' : 'bg-amber-500 dark:bg-amber-400';

  return (
    <div id={id} className={cn('text-xs', className)}>
      <div className="flex items-center gap-3">
        <div aria-hidden="true" className="grid flex-1 grid-cols-5 gap-1">
          {PASSWORD_RULES.map((rule, i) => (
            <span
              key={rule.id}
              className={cn(
                'h-1 rounded-full transition-colors duration-150 motion-reduce:transition-none',
                i < met ? fill : 'bg-[var(--border-color)] dark:bg-[var(--border-strong)]',
              )}
            />
          ))}
        </div>
        <span className={cn('shrink-0 font-semibold', tone)}>
          {word}
          <span className="sr-only">: {met} of {PASSWORD_RULES.length} rules met.</span>
        </span>
      </div>

      {showUnmet && (
        <p role="alert" className="mt-2.5 font-medium text-red-600 dark:text-red-400">
          Add what is missing below to continue.
        </p>
      )}

      <ul className="m-0 mt-3 grid list-none gap-x-4 gap-y-2 p-0 sm:grid-cols-2">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.pattern.test(password);
          const missed = !ok && showUnmet;
          const Icon = ok ? Check : missed ? X : Circle;
          return (
            <li
              key={rule.id}
              className={cn(
                'flex items-center gap-2 transition-colors duration-150 motion-reduce:transition-none',
                ok ? 'text-emerald-700 dark:text-emerald-400' : missed ? 'text-red-600 dark:text-red-400' : 'text-[var(--text-secondary)]',
              )}
            >
              <Icon className={cn('shrink-0', ok || missed ? 'size-3.5' : 'size-3')} strokeWidth={ok || missed ? 2.5 : 2} aria-hidden="true" />
              <span>
                {rule.label}
                <span className="sr-only">{ok ? ' (done)' : ' (still needed)'}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
