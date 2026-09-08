"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";

// A measured CSS grid gives us a real staggered board while retaining DOM order.
export function MasonryCell({ children }: { children: ReactNode }) {
  const cell = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!cell.current || !content.current) return;
    const outer = cell.current;
    const inner = content.current;
    const measure = () => {
      const gap =
        Number.parseFloat(
          getComputedStyle(outer).getPropertyValue("--pin-gap"),
        ) || 20;
      const span = Math.ceil(inner.getBoundingClientRect().height + gap);
      if (outer.style.gridRowEnd !== `span ${span}`)
        outer.style.gridRowEnd = `span ${span}`;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="inventory-masonry-cell" ref={cell}>
      <div ref={content}>{children}</div>
    </div>
  );
}
