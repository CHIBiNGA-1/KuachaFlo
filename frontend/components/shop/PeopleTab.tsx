"use client";

import { useResync } from "@/lib/offline/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { money } from "@/lib/format";
import {
  ShopError,
  listCustomers,
  listSuppliers,
  listTeam,
  tintForName,
  type Customer,
  type PartyKind,
  type Person,
  type Supplier,
  type TeamMember,
} from "@/lib/shop";
import { GlyphYou } from "../Glyph";
import { PersonSheet } from "./PersonSheet";

const COPY: Record<
  PartyKind,
  { title: string; sub: string; empty: string; add: string; first: string; search: string }
> = {
  customers: {
    title: "Customers.",
    sub: "The people who buy.",
    empty: "No customers in the book yet. Add the regulars first.",
    add: "Add",
    first: "Add your first customer",
    search: "Search name, company, phone…",
  },
  suppliers: {
    title: "Suppliers.",
    sub: "The people who stock you.",
    empty: "No suppliers in the book yet. Add whoever delivers.",
    add: "Add",
    first: "Add your first supplier",
    search: "Search name, contact, category…",
  },
  team: {
    title: "Team.",
    sub: "The people beside you.",
    empty: "Nobody on the team yet. It's just you — for now.",
    add: "Add",
    first: "Add your first teammate",
    search: "Search name, role…",
  },
};

async function loadKind(kind: PartyKind): Promise<Person[]> {
  if (kind === "customers") return listCustomers();
  if (kind === "suppliers") return listSuppliers();
  return listTeam();
}

function subLine(kind: PartyKind, p: Person): string {
  if (kind === "customers") {
    const c = p as Customer;
    return [c.company, c.channel].filter(Boolean).join(" · ") || "—";
  }
  if (kind === "suppliers") {
    const s = p as Supplier;
    return [s.contact_person, s.category].filter(Boolean).join(" · ") || "—";
  }
  return (p as TeamMember).role || "—";
}

function chip(kind: PartyKind, p: Person): { label: string; hot: boolean } | null {
  if (kind === "customers") {
    const b = (p as Customer).balance || 0;
    if (b > 0) return { label: `${money(b)} due`, hot: true };
    return null;
  }
  const s = (p as Supplier | TeamMember).status;
  if (s && s !== "Active") return { label: s, hot: s === "Inactive" };
  return null;
}

export function PeopleTab({ kind, onBack }: { kind: PartyKind; onBack: () => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<
    { mode: "closed" } | { mode: "new" } | { mode: "view"; person: Person }
  >({ mode: "closed" });

  const copy = COPY[kind];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPeople(await loadKind(kind));
    } catch (e) {
      setError(e instanceof ShopError ? e.message : "Couldn't load — try again.");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);
  useResync(load);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      `${p.name} ${p.email} ${p.phone} ${subLine(kind, p)}`.toLowerCase().includes(q)
    );
  }, [people, query, kind]);

  return (
    <div>
      <button
        onClick={onBack}
        className="text-[13px] font-extrabold text-muted"
        aria-label="Back to More"
      >
        ‹ More
      </button>
      <div className="mt-1.5 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[34px] leading-tight">{copy.title}</h1>
          <p className="mt-1 text-[13px] text-muted">{copy.sub}</p>
        </div>
        <button onClick={() => setSheet({ mode: "new" })} className="btn btn-accent shrink-0">
          + {copy.add}
        </button>
      </div>

      <input
        className="field mt-4"
        placeholder={copy.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search people"
      />

      <div className="mt-3">
        {loading ? (
          <div className="card animate-pulse p-8 text-center text-[13px] font-bold text-muted">
            Opening the book…
          </div>
        ) : error ? (
          <div className="card p-8 text-center">
            <div className="kicker">Something hiccuped</div>
            <p className="mt-2 text-[13px] font-bold">{error}</p>
            <button onClick={load} className="btn btn-dark mt-4">
              Try again
            </button>
          </div>
        ) : people.length === 0 ? (
          <div className="card px-2 py-9 text-center">
            <div className="text-muted">
              <GlyphYou size={44} />
            </div>
            <p className="mx-auto mt-3 max-w-[250px] text-[13px] leading-relaxed text-muted">
              {copy.empty}
            </p>
            <button onClick={() => setSheet({ mode: "new" })} className="btn btn-accent mt-4">
              {copy.first}
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="card px-2 py-9 text-center">
            <p className="mx-auto max-w-[240px] text-[13px] leading-relaxed text-muted">
              Nobody matches. Try another search.
            </p>
          </div>
        ) : (
          <div className="card px-4 py-1">
            {shown.map((p) => {
              const c = chip(kind, p);
              return (
                <button
                  key={p.id}
                  onClick={() => setSheet({ mode: "view", person: p })}
                  className="flex w-full items-center gap-3 py-3 text-left"
                  style={{ borderBottom: "1px solid var(--line)" }}
                >
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-black text-white"
                    style={{ background: tintForName(p.name) }}
                  >
                    {p.name.substring(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">{p.name}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {subLine(kind, p)}
                    </span>
                  </span>
                  {c && (
                    <span
                      className="tnum shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black"
                      style={{
                        background: c.hot ? "var(--red)" : "var(--bg)",
                        color: c.hot ? "#fff" : "var(--ink)",
                      }}
                    >
                      {c.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {!loading && !error && people.length >= 200 && (
          <p className="mt-2.5 text-center text-[11px] text-muted">Showing the first 200.</p>
        )}
      </div>

      {(sheet.mode === "new" || sheet.mode === "view") && (
        <PersonSheet
          kind={kind}
          person={sheet.mode === "view" ? sheet.person : null}
          onClose={() => setSheet({ mode: "closed" })}
          onChanged={load}
        />
      )}
    </div>
  );
}