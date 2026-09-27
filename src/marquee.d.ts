import * as React from "react";

// The <marquee> tag is obsolete but still rendered by every browser; React's
// own JSX types don't list it, so this augments React's JSX namespace (not
// the global one — React 19's new JSX transform resolves through
// `React.JSX`, not a global `JSX`) with just enough to type-check.
declare global {
  interface MarqueeElement extends HTMLElement {
    start(): void;
    stop(): void;
  }
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      marquee: React.DetailedHTMLProps<
        React.HTMLAttributes<MarqueeElement> & {
          behavior?: "scroll" | "slide" | "alternate";
          direction?: "left" | "right" | "up" | "down";
          scrollamount?: number | string;
          scrolldelay?: number | string;
          loop?: number | string;
        },
        MarqueeElement
      >;
    }
  }
}
