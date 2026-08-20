type Props = { slug: string; size?: number; className?: string };

/**
 * Small stroke-based icons for the 7 fixed category slugs, matching the
 * nav's monoline glyph style (⌂ ▤ ◫ ◌) instead of full-color platform
 * emoji. Falls back to a generic tag icon for any unrecognised slug.
 */
export function CategoryIcon({ slug, size = 15, className }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };

  switch (slug) {
    case "fuel-transport":
      return (
        <svg {...common}>
          <path d="M4 16V6a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v10" />
          <path d="M3 16h9" />
          <path d="M11 8h2.5L15 10v4a1 1 0 0 1-1 1h-1" />
          <circle cx="6" cy="16" r="1.4" />
          <circle cx="11.5" cy="16" r="1.4" />
        </svg>
      );
    case "meals":
      return (
        <svg {...common}>
          <path d="M6 2.5v6a1.5 1.5 0 0 0 3 0v-6" />
          <path d="M7.5 8.5V17.5" />
          <path d="M13.5 2.5c-1 0-1.8 1-1.8 3s.8 3.3 1.8 3.3V17.5" />
        </svg>
      );
    case "supplies":
      return (
        <svg {...common}>
          <path d="M10 2.5 17 6.2v7.6L10 17.5l-7-3.7V6.2L10 2.5Z" />
          <path d="M3 6.2 10 10l7-3.8" />
          <path d="M10 10v7.5" />
        </svg>
      );
    case "equipment":
      return (
        <svg {...common}>
          <path d="M13.2 3.3a3.3 3.3 0 0 0-4.4 4l-6 6 2.1 2.1 6-6a3.3 3.3 0 0 0 4-4.4l-2.1 2.1-1.9-.5-.5-1.9 2.8-2.4Z" />
        </svg>
      );
    case "accessories":
      return (
        <svg {...common}>
          <path d="M6.5 8V5.5a3.5 3.5 0 0 1 7 0V8" />
          <rect x="4" y="8" width="12" height="9" rx="1.6" />
        </svg>
      );
    case "software":
      return (
        <svg {...common}>
          <rect x="2.5" y="4" width="15" height="10" rx="1.4" />
          <path d="M7 17.5h6" />
          <path d="M10 14v3.5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M11.5 2.5H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8l-4.5-5.5Z" />
          <path d="M11.5 2.5V8H16" />
        </svg>
      );
  }
}
