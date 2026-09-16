"use client";

import type { CSSProperties } from "react";

/** Minimal stroke glyphs. One visual language, no emoji in chrome. */
function Svg({
  size = 20,
  style,
  children,
}: {
  size?: number;
  style?: CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function GlyphHome({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </Svg>
  );
}

export function GlyphPlus({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function GlyphRows({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </Svg>
  );
}

export function GlyphTray({ size = 40 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </Svg>
  );
}

export function GlyphStore({ size = 28 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M3 9l1.6-5h14.8L21 9" />
      <path d="M4 9v11h16V9" />
      <path d="M9 20v-6h6v6" />
    </Svg>
  );
}

export function GlyphLock({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  );
}

export function GlyphYou({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </Svg>
  );
}

export function GlyphChat({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </Svg>
  );
}

export function GlyphChart({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </Svg>
  );
}

export function GlyphBox({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </Svg>
  );
}

export function GlyphCart({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </Svg>
  );
}

export function GlyphDots({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </Svg>
  );
}