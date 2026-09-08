"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, MoreHorizontal, type LucideIcon } from "lucide-react";

export type MenuAction = {
  id: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
};

/** A small, keyboard-complete disclosure for secondary actions. */
export function ActionMenu({
  label,
  actions,
  className = "",
}: {
  label: string;
  actions: MenuAction[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<"first" | "last">("first");
  useEffect(() => {
    if (!open) return;
    const items = menu.current?.querySelectorAll<HTMLButtonElement>(
      "button:not([disabled])",
    );
    if (items?.length)
      items[initialFocus.current === "last" ? items.length - 1 : 0].focus();
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div className={`calm-action-menu ${className}`} ref={container}>
      <button
        ref={trigger}
        className="icon-button calm-menu-trigger"
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          initialFocus.current = "first";
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            initialFocus.current = event.key === "ArrowUp" ? "last" : "first";
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal size={19} />
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          className="calm-menu-panel"
          ref={menu}
          onKeyDown={(event) => {
            const items = Array.from(
              menu.current?.querySelectorAll<HTMLButtonElement>(
                "button:not([disabled])",
              ) || [],
            );
            const index = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              trigger.current?.focus();
            } else if (
              ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) &&
              items.length
            ) {
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                      items.length;
              items[next]?.focus();
            } else if (event.key === "Tab") setOpen(false);
          }}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role={
                action.checked === undefined ? "menuitem" : "menuitemcheckbox"
              }
              aria-checked={action.checked}
              disabled={action.disabled}
              className={action.danger ? "danger-text" : ""}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                action.onSelect();
              }}
            >
              {action.icon && <action.icon size={15} />}
              <span>{action.label}</span>
              {action.checked && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
