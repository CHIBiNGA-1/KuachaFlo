import type { Product } from "./shop";

/** Tones are washes behind the photo — they keep the board warm while
 * images load, and carry the whole card when a product has no photo yet. */
export const TONES = ["sand", "sage", "peach", "clay", "blue", "rose", "cream"] as const;
export type Tone = (typeof TONES)[number];

/** Varied ratios are what make the shelf feel like a shelf rather than a
 * spreadsheet — a grid of identical squares reads as a table with pictures.
 * A product's ratio is derived from its name so it never reshuffles
 * between renders or sessions. */
const RATIOS = [0.86, 1.02, 0.94, 1.12, 0.79, 1.0];

function hash(text: string): number {
  let sum = 0;
  for (let i = 0; i < text.length; i++) sum = (sum * 31 + text.charCodeAt(i)) >>> 0;
  return sum;
}

export function productArt(product: Pick<Product, "name" | "image" | "category">) {
  const h = hash(product.name || "");
  const src = product.image?.trim() ? product.image.trim() : undefined;
  return {
    src,
    ratio: RATIOS[h % RATIOS.length],
    tone: TONES[h % TONES.length],
  };
}
