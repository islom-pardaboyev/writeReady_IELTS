import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

// The site's loading indicator: the WriteReady logo as a 3D tile that swings
// gently. It replaces the plain spinning ring everywhere a page or panel waits.
//
// The .wr-* styles are in index.html on purpose (see the note there): the same
// markup sits inside #root as a splash, so the logo shows before any bundle
// has loaded, and this component takes over from it without a visible change.
// Small spinners inside buttons and refresh icons stay as they are.

const EDGE_LAYERS = [-3, -2, -1, 0, 1, 2, 3];

export function LogoLoader({
  size = 72,
  label = "Loading",
  className,
}: {
  /** Width and height of the tile, in px. */
  size?: number;
  /** What a screen reader announces, e.g. "Loading teachers". */
  label?: string;
  className?: string;
}) {
  // Read once, while React is still rendering the very first screen: if the
  // splash is still in the page, skip the fade-in so the logo never blinks out.
  // Loaders that appear later fade in after 0.2s, so a quick load doesn't flash
  // a logo for a split second.
  const [instant] = useState(() => !!document.getElementById("wr-splash"));

  // Start the swing at the page clock's zero, like the splash does, so every
  // loader is at the same point of the swing and a new one continues the
  // motion of the one it replaces. (Starting it "now" would drift by however
  // long the browser takes to draw its first frame, which is long at boot.)
  const tile = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    tile.current?.getAnimations().forEach((a) => {
      if ((a as CSSAnimation).animationName === "wr-swing") a.startTime = 0;
    });
  }, []);

  return (
    <span
      role="status"
      aria-label={label}
      className={cn("wr-loader", instant && "wr-now", className)}
      style={{ "--wr-size": `${size}px` } as CSSProperties}
    >
      <span className="wr-stage" aria-hidden="true">
        <span ref={tile} className="wr-tile">
          {EDGE_LAYERS.map((k) => (
            <span key={k} className="wr-edge" style={{ "--k": k } as CSSProperties} />
          ))}
          <span className="wr-face">
            <svg viewBox="0 0 512 512" focusable="false">
              <rect width="512" height="512" fill="#4f46e5" />
              <polyline points="104,176 180,368 256,216 332,368" fill="none" stroke="#ffffff" strokeWidth="56" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="332,368 416,120" fill="none" stroke="#f59e0b" strokeWidth="56" strokeLinecap="round" />
            </svg>
          </span>
        </span>
      </span>
    </span>
  );
}
