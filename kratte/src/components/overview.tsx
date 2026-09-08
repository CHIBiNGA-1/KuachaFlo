"use client";
import { useId, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  CalendarDays,
  ChevronDown,
  Check,
} from "lucide-react";
import { useShop } from "@/components/shop-provider";
import { analytics, dateRange, type Period } from "@/lib/analytics";
import { money } from "@/lib/types";

export function PeriodPicker({
  value,
  onChange,
}: {
  value: Period;
  onChange: (value: Period) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data } = useShop();
  const { start, end } = dateRange(Number(value), data?.user.settings.timezone);
  const label = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  return (
    <div className="dropdown-wrap">
      <button
        className="button date-button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Choose reporting period"
      >
        <CalendarDays size={16} />
        <span>{label}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <>
          <button
            className="dropdown-dismiss"
            aria-label="Close date selector"
            onClick={() => setOpen(false)}
          />
          <div className="dropdown-menu date-menu">
            <p className="menu-label">REPORTING PERIOD</p>
            {(["7", "30", "60"] as Period[]).map((days) => (
              <button
                key={days}
                className={value === days ? "selected" : ""}
                onClick={() => {
                  onChange(days);
                  setOpen(false);
                }}
              >
                Last {days} days{value === days && <Check size={15} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
function smoothPath(points: number[][]) {
  if (!points.length) return "M0 0";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[Math.max(0, i - 2)],
      p1 = points[i - 1],
      p2 = points[i],
      p3 = points[Math.min(points.length - 1, i + 1)];
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}
export function Growth({ value }: { value: number }) {
  return (
    <span className={`growth ${value < 0 ? "negative" : ""}`}>
      {value >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}
export function RevenueChart({
  points,
  currency,
  weekly = false,
}: {
  points: ReturnType<typeof analytics>["points"];
  currency: string;
  weekly?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const id = useId().replaceAll(":", "");
  const data = weekly
    ? Array.from({ length: Math.ceil(points.length / 7) }, (_, i) => ({
        ...points[i * 7],
        current: points
          .slice(i * 7, i * 7 + 7)
          .reduce((s, p) => s + p.current, 0),
        previous: points
          .slice(i * 7, i * 7 + 7)
          .reduce((s, p) => s + p.previous, 0),
      }))
    : points;
  const maximum = Math.max(
    ...data.flatMap((p) => [p.current, p.previous]),
    100,
  );
  const step = maximum > 1000 ? 1000 : maximum > 100 ? 100 : 25;
  const max = Math.ceil(maximum / step) * step;
  const coords = (key: "current" | "previous") =>
    data.map((point, i) => [
      52 + i * (624 / Math.max(data.length - 1, 1)),
      173 - (point[key] / max) * 149,
    ]);
  const current = coords("current");
  const previous = coords("previous");
  const path = smoothPath(current);
  const ticks = Array.from(
    new Set(
      Array.from({ length: 6 }, (_, i) =>
        Math.round((i * (data.length - 1)) / 5),
      ),
    ),
  );
  const selected = active !== null ? data[active] : null;
  return (
    <div className="chart-wrap">
      <svg
        className="revenue-svg"
        viewBox="0 0 700 208"
        role="img"
        aria-label={`Revenue chart for the last ${points.length} days`}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 700;
          setActive(
            Math.max(
              0,
              Math.min(
                data.length - 1,
                Math.round(((x - 52) / 624) * (data.length - 1)),
              ),
            ),
          );
        }}
        onMouseLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={`revenue-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#20936d" stopOpacity=".17" />
            <stop offset="1" stopColor="#20936d" stopOpacity=".015" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => {
          const y = 173 - (i * 149) / 3;
          const amount = (max * i) / 3;
          return (
            <g key={i}>
              <line
                x1="52"
                x2="680"
                y1={y}
                y2={y}
                stroke="#e9edeb"
                strokeDasharray="3 4"
              />
              <text x="38" y={y + 4} textAnchor="end" className="chart-label">
                {amount >= 1000
                  ? `${money(amount / 1000, currency, amount % 1000 > 100 ? 1 : 0)}k`
                  : money(amount, currency, 0)}
              </text>
            </g>
          );
        })}
        <path
          d={smoothPath(previous)}
          fill="none"
          stroke="#b7c6be"
          strokeWidth="2"
          strokeDasharray="5 5"
          strokeLinecap="round"
        />
        <path d={`${path} L676 173 L52 173 Z`} fill={`url(#revenue-${id})`} />
        <path
          d={path}
          fill="none"
          stroke="#238563"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {ticks.map((i) => (
          <text
            className="chart-label"
            key={i}
            x={52 + (i * 624) / Math.max(data.length - 1, 1)}
            y="201"
            textAnchor={
              i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"
            }
          >
            {data[i]?.date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </text>
        ))}
        {active !== null && current[active] && (
          <g>
            <line
              x1={current[active][0]}
              x2={current[active][0]}
              y1="15"
              y2="174"
              stroke="#80ad95"
              strokeDasharray="3 3"
            />
            <circle
              cx={current[active][0]}
              cy={current[active][1]}
              r="5"
              fill="#238563"
              stroke="white"
              strokeWidth="2.5"
            />
          </g>
        )}
      </svg>
      {selected && (
        <div
          className="chart-tooltip"
          style={{
            left: `${Math.min(77, Math.max(10, 7 + ((active || 0) / Math.max(data.length - 1, 1)) * 80))}%`,
          }}
        >
          <span>
            {selected.date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
            {weekly ? " · week" : ""}
          </span>
          <strong>{money(selected.current, currency)}</strong>
          <small>
            <i />
            Revenue
          </small>
        </div>
      )}
    </div>
  );
}
