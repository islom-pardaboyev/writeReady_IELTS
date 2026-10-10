import { Link } from 'react-router';
import Logo from '/logo.svg';
import { ReportSample } from '@/components/landing/ReportSample';
import { PenUnderline } from '@/components/landing/PenUnderline';

/**
 * The half beside the sign-in form, from 1024px: the home page's indigo field
 * with its promise line and a sample report on a white sheet, so the visitor
 * sees what they are signing in for. It is exactly one screen tall and stays
 * put, so it can never make the page scroll; on a short screen the sample
 * sheds its lower parts (ReportSample) and then goes. On phones it is left out
 * and the form has the whole screen (.impeccable/surfaces/src-pages-authpage-tsx.md).
 */
export function AuthAside() {
  return (
    <aside className="hidden bg-brand-600 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col justify-between gap-[clamp(0.75rem,2.5dvh,1.5rem)] px-10 py-[clamp(1rem,3.5dvh,2.5rem)] xl:px-16">
        <Link
          to="/"
          className="flex w-fit items-center gap-2.5 rounded-lg font-display text-lg font-extrabold text-white no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-brand-600"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-white">
            <img src={Logo} width={32} height={32} className="size-8" alt="" />
          </span>
          WriteReady IELTS
        </Link>

        <div className="mx-auto w-full max-w-[440px]">
          <p className="font-display text-[clamp(1.75rem,min(2.8vw,5.2dvh),2.75rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-balance text-white">
            Find out which sentences{' '}
            <span className="relative inline-block whitespace-nowrap">
              cost you marks.
              <PenUnderline className="stroke-amber-300" />
            </span>
          </p>
          <p className="mt-[clamp(0.75rem,2.4dvh,1.25rem)] max-w-[40ch] text-base leading-relaxed text-white/85">
            An estimated band for your Task 1 or Task 2 answer, with a note on every sentence.
          </p>
          <ReportSample className="mt-[clamp(1rem,3.5dvh,2rem)] [@media(max-height:600px)]:hidden" captionClassName="text-white/80" />
        </div>

        <p className="text-sm text-white/80">Band scores are AI estimates. Not connected to the British Council, IDP or Cambridge.</p>
      </div>
    </aside>
  );
}
