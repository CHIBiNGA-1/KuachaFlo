"use client";
import { useCallback, useState } from "react";
import Image from "next/image";
import { Camera, Leaf } from "lucide-react";
import { productArt } from "@/lib/product-art";
import type { Entity } from "@/lib/types";

export function ProductPhoto({
  product,
  eager = false,
}: {
  product: Pick<Entity, "name" | "image" | "category">;
  eager?: boolean;
}) {
  const art = productArt(product);
  const [failedSrc, setFailedSrc] = useState<string | undefined>();
  const [readySrc, setReadySrc] = useState<string | undefined>();
  const imageRef = useCallback(
    (image: HTMLImageElement | null) => {
      if (image?.complete && image.naturalWidth) setReadySrc(art.src);
    },
    [art.src],
  );
  const missing = !art.src || failedSrc === art.src;
  return (
    <span
      className={`pin-photo photo-${art.tone} ${!missing && readySrc === art.src ? "photo-ready" : ""}`}
    >
      {missing ? (
        <span className="pin-photo-placeholder">
          <span className="placeholder-orbit">
            <Leaf size={36} strokeWidth={1.1} />
          </span>
          <strong>A little camera shy.</strong>
          <small>
            <Camera size={12} />
            Add a photo in product details
          </small>
        </span>
      ) : (
        <Image
          unoptimized
          width={850}
          height={1062}
          ref={imageRef}
          key={art.src}
          src={art.src!}
          alt={product.name}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setReadySrc(art.src)}
          onError={() => setFailedSrc(art.src)}
        />
      )}
    </span>
  );
}
