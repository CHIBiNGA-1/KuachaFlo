import type { Entity } from "@/lib/types";

type ProductArt = { file: string; ratio: number; tone: string };
const artwork: Record<string, ProductArt> = {
  "Arabica Coffee Beans": { file: "coffee", ratio: 0.87, tone: "sand" },
  "Extra Virgin Olive Oil": { file: "olive-oil", ratio: 0.82, tone: "olive" },
  "Organic Rolled Oats": { file: "oats", ratio: 0.99, tone: "sage" },
  "Pure Wildflower Honey": { file: "honey", ratio: 0.78, tone: "peach" },
  "Matcha Green Tea": { file: "matcha", ratio: 0.81, tone: "sage" },
  "Wholegrain Pasta": { file: "pasta", ratio: 1.11, tone: "clay" },
  "Unsweetened Almond Milk": { file: "almond-milk", ratio: 1, tone: "blue" },
  "Dark Chocolate 70%": { file: "chocolate", ratio: 0.91, tone: "rose" },
  "Himalayan Pink Salt": { file: "salt", ratio: 1.16, tone: "peach" },
  "Premium Basmati Rice": { file: "rice", ratio: 0.85, tone: "sand" },
  "Organic Coconut Oil": { file: "coconut-oil", ratio: 1.05, tone: "cream" },
  "Handmade Oat Soap": { file: "soap", ratio: 0.92, tone: "sand" },
};
const catalogNames = [
  "Arabica Coffee Beans",
  "Extra Virgin Olive Oil",
  "Organic Rolled Oats",
  "Pure Wildflower Honey",
  "Matcha Green Tea",
  "Wholegrain Pasta",
];
export function productArt(
  product: Pick<Entity, "name" | "image" | "category">,
) {
  const catalogName = product.image?.startsWith("catalog:")
    ? catalogNames[Number(product.image.split(":")[1])]
    : undefined;
  const known = artwork[catalogName || product.name];
  const custom =
    product.image && !product.image.startsWith("catalog:")
      ? product.image
      : undefined;
  const hash = [...product.name].reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );
  return {
    src: custom || (known ? `/images/inventory/${known.file}.webp` : undefined),
    ratio: known?.ratio || [0.88, 1.04, 0.95, 1.1][hash % 4],
    tone: known?.tone || ["sage", "sand", "peach", "blue", "rose"][hash % 5],
  };
}
