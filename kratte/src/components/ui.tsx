"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import Image from "next/image";
import { X, Package, LoaderCircle, SearchX, ArrowUpRight } from "lucide-react";
import { initials, type Entity } from "@/lib/types";
import { productArt } from "@/lib/product-art";

const dialogStack: HTMLDivElement[] = [];
let bodyOverflowBeforeDialogs = "";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <svg
        width="34"
        height="36"
        viewBox="0 0 34 36"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5 12.5 17 6l12 6.5v14L17 33 5 26.5v-14Z"
          fill="currentColor"
        />
        <path
          d="m5.5 12.7 11.5 6.4 11.5-6.4M17 19v14"
          stroke="white"
          strokeWidth="2"
        />
        <path
          d="M10.5 9.4 22.8 16v8"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="m13 4 4-2 4 2"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {!small && (
        <span>
          kratte<span className="brand-dot">.</span>
        </span>
      )}
    </div>
  );
}
export function Avatar({
  name,
  size = "normal",
}: {
  name: string;
  size?: "normal" | "small" | "large";
}) {
  const colors = ["peach", "sage", "lilac", "blue", "rose"];
  const index =
    [...name].reduce((s, c) => s + c.charCodeAt(0), 0) % colors.length;
  return (
    <span className={`avatar avatar-${size} ${colors[index]}`}>
      {initials(name)}
    </span>
  );
}
export function ProductThumb({
  product,
  large = false,
}: {
  product: Pick<Entity, "name" | "image" | "category">;
  large?: boolean;
}) {
  const image = productArt(product).src;
  if (image)
    return (
      <span className={`product-thumb ${large ? "large" : ""}`}>
        <Image
          unoptimized
          width={78}
          height={83}
          src={image}
          alt={product.name}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
            event.currentTarget.parentElement?.classList.add("image-fallback");
          }}
        />
      </span>
    );
  return (
    <span
      className={`product-thumb product-placeholder ${large ? "large" : ""}`}
    >
      <Package size={large ? 34 : 20} strokeWidth={1.5} />
    </span>
  );
}
export function Badge({
  children,
  dot = false,
}: {
  children: ReactNode;
  dot?: boolean;
}) {
  const text = String(children);
  let color = "neutral";
  if (["Completed", "Paid", "Active", "In stock", "Received"].includes(text))
    color = "green";
  if (["Pending", "Unpaid", "Low stock", "Ordered", "Invited"].includes(text))
    color = "amber";
  if (["Out of stock", "Overdue"].includes(text)) color = "red";
  if (text === "Wholesale" || text === "Manager") color = "purple";
  if (text === "Retail" || text === "Online") color = "blue";
  return (
    <span className={`badge ${color}`}>
      {dot && <i />}
      {children}
    </span>
  );
}
export function Spinner({ size = 18 }: { size?: number }) {
  return <LoaderCircle size={size} className="spin" aria-label="Loading" />;
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    if (!dialogStack.length) {
      bodyOverflowBeforeDialogs = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    dialogStack.forEach((item) => {
      item.inert = true;
    });
    dialogStack.push(dialog);
    const focusFirst = () =>
      (
        dialog.querySelector<HTMLElement>(
          "input:not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])",
        ) || dialog.querySelector<HTMLElement>("button:not([disabled])")
      )?.focus();
    const timer = setTimeout(() => {
      // A user may already be typing before the opening animation settles.
      // Never redirect focus from another control inside this dialog.
      if (
        dialogStack.at(-1) === dialog &&
        !dialog.contains(document.activeElement)
      )
        focusFirst();
    }, 20);
    const listener = (event: KeyboardEvent) => {
      if (dialogStack.at(-1) !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        ),
      ).filter((item) => item.getClientRects().length > 0);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", listener);
      const index = dialogStack.indexOf(dialog);
      if (index !== -1) dialogStack.splice(index, 1);
      dialog.inert = false;
      const top = dialogStack.at(-1);
      if (top) {
        top.inert = false;
        if (previous?.isConnected && top.contains(previous)) previous.focus();
        else
          top
            .querySelector<HTMLElement>("input, select, textarea, button")
            ?.focus();
      } else {
        document.body.style.overflow = bodyOverflowBeforeDialogs;
        if (previous?.isConnected) previous.focus();
      }
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
      >
        <div className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function EmptyState({
  title = "Nothing here just yet",
  description,
  action,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <SearchX size={28} strokeWidth={1.4} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}
export function CardHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function TextLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
export function DashboardSkeleton() {
  return (
    <div
      className="dashboard-loading"
      aria-label="Loading your workspace"
      aria-busy="true"
    >
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-subtitle" />
      <div className="stats-grid">
        {[1, 2, 3, 4].map((i) => (
          <div className="skeleton skeleton-stat" key={i} />
        ))}
      </div>
      <div className="overview-grid">
        <div className="skeleton skeleton-chart" />
        <div className="skeleton skeleton-chart" />
      </div>
      <div className="skeleton skeleton-table" />
    </div>
  );
}
