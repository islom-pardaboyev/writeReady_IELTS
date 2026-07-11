import { useFullscreen } from '../../hooks/useFullscreen';

function ExpandIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function CompressIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

/**
 * Fullscreen toggle for the writing-mode top bars. Pass a `className` that
 * matches each mode's button styling. Esc exits fullscreen natively.
 */
export function FullscreenButton({ className = '' }: { className?: string }) {
  const { isFullscreen, toggle } = useFullscreen();
  return (
    <button
      type="button"
      onClick={toggle}
      title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
      aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      className={className}
    >
      {isFullscreen ? <CompressIcon /> : <ExpandIcon />}
    </button>
  );
}
