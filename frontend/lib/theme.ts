export type Theme = "studio" | "paper" | "slate" | "night";

export const THEMES: { id: Theme; label: string; sub: string; swatch: string }[] = [
  { id: "studio", label: "Studio", sub: "Warm light", swatch: "#f4f3ee" },
  { id: "paper", label: "Paper", sub: "Soft, tactile", swatch: "#efe9dc" },
  { id: "slate", label: "Slate", sub: "Cool & crisp", swatch: "#e9edf0" },
  { id: "night", label: "Night", sub: "Low-light", swatch: "#101415" },
];

const KEY = "kratte-theme";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "studio";
  const saved = window.localStorage.getItem(KEY) as Theme | null;
  return saved && THEMES.some((t) => t.id === saved) ? saved : "studio";
}

export function applyTheme(theme?: Theme): Theme {
  const t = theme ?? getTheme();
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = t;
    window.localStorage.setItem(KEY, t);
  }
  return t;
}