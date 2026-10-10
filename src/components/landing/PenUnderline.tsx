/**
 * The examiner's pen line under a few words: wrap the words in a
 * `relative inline-block` span and put this inside it. It draws itself once
 * as the page opens (`.pen-draw` in src/index.css) and is simply there under
 * reduced motion. `className` sets the stroke colour.
 */
export function PenUnderline({ className = 'stroke-red-500 dark:stroke-red-400' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 16"
      preserveAspectRatio="none"
      className="absolute inset-x-[-1%] -bottom-[0.2em] h-[0.24em] w-[102%] overflow-visible"
    >
      <path
        pathLength={1}
        d="M2 9 Q 22 0 42 9 T 82 9 T 122 9 T 162 9 T 202 9 T 242 9 T 282 9 T 322 9 T 362 9 T 398 8"
        fill="none"
        strokeWidth="3.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className={`pen-draw ${className}`}
      />
    </svg>
  );
}
