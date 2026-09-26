import { useState } from 'react';
import { ArrowUpRight, Send, X } from 'lucide-react';
import { Card } from './Card';
import { TELEGRAM_BOT_URL } from '@/lib/links';
import { useShowTelegramBot } from '@/hooks/useFeatureFlag';

const HIDDEN_KEY = 'telegramBotCardHidden';

function wasHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Tells a signed-in student about the Telegram bot (api/_lib/studentBot.ts).
 * They can hide it; that choice is kept in this browser only.
 *
 * `paidPlan`: the bot's weekly check comes on top of a paid plan, while on
 * the free plan it is the site's own weekly report, so only paid plans are
 * told about it.
 */
export function TelegramBotCard({ paidPlan }: { paidPlan: boolean }) {
  const [hidden, setHidden] = useState(wasHidden);
  // Admin -> Telegram bot: hidden from the site until the admin announces it.
  const botShown = useShowTelegramBot();
  if (hidden || !botShown) return null;

  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDDEN_KEY, '1');
    } catch {
      /* it shows again on the next visit */
    }
  };

  return (
    <Card className="relative mb-10 flex flex-wrap items-center gap-x-5 gap-y-4 py-5 pl-6 pr-12">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#229ED9] text-white" aria-hidden="true">
        <Send size={22} className="-translate-x-px translate-y-px" />
      </div>
      <div className="min-w-[220px] flex-1">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">WriteReady is on Telegram</h2>
        <p className="mt-1 text-pretty text-sm leading-relaxed text-[var(--text-secondary)]">
          Check an essay from your phone and get your band in about 20 seconds
          {paidPlan ? ', with 1 free check a week on top of your plan' : ''}. You also get a new IELTS word every day
          with its Uzbek meaning. Connect your account in the bot with /account, and the essays you check there are
          saved here.
        </p>
      </div>
      <a
        href={TELEGRAM_BOT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-[var(--ink-blue-solid)] px-5 font-semibold text-white no-underline transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]"
      >
        Open the bot
        <ArrowUpRight size={16} aria-hidden="true" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      <button
        type="button"
        onClick={hide}
        aria-label="Hide this card"
        className="absolute right-2 top-2 inline-flex size-9 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </Card>
  );
}
