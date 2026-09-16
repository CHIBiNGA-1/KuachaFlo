"use client";

import { useCallback, useState } from "react";
import { productArt } from "@/lib/product-art";
import type { Product } from "@/lib/shop";

/** A photo, or — far more often in a real shop — a calm coloured tile that
 * doesn't look broken. Most owners never upload images; the shelf has to
 * look deliberate without them, not like a page that failed to load. */
export function ProductPhoto({
  product,
  eager = false,
}: {
  product: Pick<Product, "name" | "image" | "category">;
  eager?: boolean;
}) {
  const art = productArt(product);
  const [failed, setFailed] = useState<string | undefined>();
  const [ready, setReady] = useState<string | undefined>();

  const imgRef = useCallback(
    (el: HTMLImageElement | null) => {
      // Cached images can finish before React attaches onLoad.
      if (el?.complete && el.naturalWidth) setReady(art.src);
    },
    [art.src]
  );

  const missing = !art.src || failed === art.src;
  const initials = (product.name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <span className={`pin-photo tone-${art.tone} ${!missing && ready === art.src ? "is-ready" : ""}`}>
      {missing ? (
        <span className="pin-photo-blank">
          <span className="blank-mark">{initials}</span>
          <small>{product.category || "Uncategorised"}</small>
        </span>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={imgRef}
          key={art.src}
          src={art.src}
          alt={product.name}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setReady(art.src)}
          onError={() => setFailed(art.src)}
        />
      )}
    </span>
  );
}
