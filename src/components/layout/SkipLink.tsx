/** First Tab stop on every page: jumps past the navigation to #main-content. */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--bg-card)] focus:text-[var(--text-primary)] focus:shadow-lg"
    >
      Skip to main content
    </a>
  );
}
