import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { isPdfSrc as isPdf } from "@/lib/loadImageForPdf";
import { cn } from "@/lib/utils";
import type { ChartStatus } from "@/lib/task1Chart";
import { Button } from "@/components/ui/Button";

interface Task1 {
  image: string;
  report: string;
}

interface Props {
  task1: Task1;
  /**
   * Where the chart is on its way from the database (useTask1ChartState). Leave
   * it out when the image is already in hand, as in Relax mode.
   */
  chartStatus?: ChartStatus;
  onRetryChart?: () => void;
}

// Pictures that have already been drawn once this visit. The shuffle bag comes
// back round to the same chart, and the loader should not flash over one the
// browser already has. These are the same strings task1Chart.ts caches, so
// this holds references, not copies.
const drawn = new Set<string>();

// The frame is the same box before, during and after the picture arrives, so
// the question text above it never jumps. 3:2 is the shape the <img> already
// reserves through its width and height.
function ChartFrame({ src }: { src: string }) {
  const pdf = src !== "" && isPdf(src);
  // A PDF has no load event to wait for; once it is in hand it shows.
  const [painted, setPaintedState] = useState(() => pdf || drawn.has(src));
  const imgRef = useRef<HTMLImageElement>(null);

  const markPainted = () => {
    drawn.add(src);
    setPaintedState(true);
  };

  // A picture that finished before React attached onLoad would leave the loader up for good.
  useEffect(() => {
    if (imgRef.current?.complete) {
      drawn.add(src);
      setPaintedState(true);
    }
  }, [src]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-800 bg-white">
      {src === "" ? (
        <div className="aspect-[3/2] w-full" />
      ) : pdf ? (
        <object data={src} type="application/pdf" title="Task 1 chart" className="w-full h-[520px]">
          <iframe src={src} className="w-full h-[520px] border-0" title="Task 1 chart" />
        </object>
      ) : (
        // An error also clears the loader: a chart that cannot be drawn should show the
        // browser's own broken-image mark, not spin for ever.
        <img
          ref={imgRef}
          src={src}
          alt="Task 1 chart or diagram"
          width={1200}
          height={800}
          decoding="async"
          onLoad={markPainted}
          onError={markPainted}
          className="w-full h-auto object-contain"
        />
      )}
      <span role="status" className="sr-only">{painted ? "" : "Loading chart…"}</span>
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-neutral-800 transition-opacity duration-300",
          painted && "pointer-events-none opacity-0",
        )}
      >
        <div className="absolute inset-0 animate-pulse bg-gray-200/70 dark:bg-neutral-700/40 motion-reduce:animate-none" />
        <span className="relative inline-flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Loading chart…
        </span>
      </div>
    </div>
  );
}

function ChartError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-950 px-4 py-10 text-center"
    >
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-neutral-100">The chart did not load.</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">Check your connection, then try again. Your writing is safe.</p>
      </div>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export default function WritingTask1Preview({ task1, chartStatus, onRetryChart }: Props) {
  const status: ChartStatus = chartStatus ?? (task1.image ? "ready" : "none");
  return (
    <div className="space-y-4 text-sm">
      <div className="border-gray-200 dark:border-neutral-800 font-bold border p-4 text-gray-900 dark:text-neutral-100 leading-relaxed">
        <p className="mb-4">{task1.report}</p>
        <p>Summarise the information by selecting and reporting the main features, and make comparisons where relevant.</p>
      </div>
      {status === "error" ? (
        <ChartError onRetry={onRetryChart} />
      ) : status !== "none" ? (
        // Keyed by the picture, so a new chart starts with the loader up again.
        <ChartFrame key={task1.image} src={task1.image} />
      ) : null}
    </div>
  );
}
