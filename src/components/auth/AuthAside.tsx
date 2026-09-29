import { Link } from 'react-router';
import Logo from '/logo.svg';
import { ReportSample } from '@/components/landing/ReportSample';

/**
 * The margin beside the sign-in form, from 1024px: the landing page's slate
 * close with its answer-sheet ruling, the promise line and a sample report, so
 * the visitor sees what they are signing in for. On phones it is left out and
 * the form has the whole screen (.impeccable/surfaces/src-pages-authpage-tsx.md).
 */
export function AuthAside() {
  return (
    <aside className="relative hidden overflow-hidden bg-slate-900 lg:flex lg:flex-col dark:bg-black">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_35px,rgb(255_255_255/0.05)_35px,rgb(255_255_255/0.05)_36px)]"
      />
      <div className="relative flex flex-1 flex-col justify-between gap-12 px-10 py-10 xl:px-16 xl:py-12">
        <Link
          to="/"
          className="flex w-fit items-center gap-2.5 rounded-lg text-lg font-bold text-white no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-4 focus-visible:ring-offset-slate-900"
        >
          <img src={Logo} width={36} height={36} className="size-9" alt="" />
          <span>
            WriteReady <span className="text-brand-400">IELTS</span>
          </span>
        </Link>

        <div className="mx-auto w-full max-w-[460px]">
          <p className="text-[clamp(2rem,2.8vw,2.625rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-balance text-white">
            Find out which sentences <span className="whitespace-nowrap text-brand-400">cost you marks.</span>
          </p>
          <p className="mt-4 max-w-[40ch] text-base leading-relaxed text-white/70">
            An estimated band for your Task 1 or Task 2 answer, with a note on every sentence.
          </p>
          <ReportSample className="mt-10" captionClassName="text-white/50" />
        </div>

        <p className="text-sm text-white/50">Band scores are AI estimates. Not connected to the British Council, IDP or Cambridge.</p>
      </div>
    </aside>
  );
}
