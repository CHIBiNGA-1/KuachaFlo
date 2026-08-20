"use client";

import { useEffect, useState, useMemo } from "react";
import type { Session } from "@supabase/supabase-js";
import { api } from "@/lib/api";
import type { ReceiptResult, Category } from "@/lib/types";
import { CameraUpload } from "@/components/CameraUpload";
import { ReceiptList } from "@/components/ReceiptList";
import { AuthGate } from "@/components/AuthGate";

type View = "overview" | "receipts" | "reports" | "insights";
type Theme = "light" | "paper" | "slate" | "night";

const CAT_COLORS = ["#9eb39e", "#c6a566", "#8197ab", "#ae8c98", "#7ab3a8", "#c9b89e"];

function fmt(n: number | null | undefined, cur = "K") {
  if (n == null) return "—";
  return `${cur} ${n.toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildChart(receipts: ReceiptResult[], days = 30) {
  const today = new Date();
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  const byDate: Record<string, number> = {};
  for (const r of receipts)
    if (r.purchase_date)
      byDate[r.purchase_date] = (byDate[r.purchase_date] || 0) + (r.total_amount || 0);

  const vals = dates.map(d => byDate[d] || 0);
  const max = Math.max(...vals, 1);
  const W = 700, H = 170;
  const pts = vals.map((v, i) => ({
    x: (i / Math.max(days - 1, 1)) * W,
    y: H - (v / max) * (H - 24) - 4,
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const hasData = vals.some(v => v > 0);
  const labelIdxs = [0, Math.floor(days / 4), Math.floor(days / 2), Math.floor((days * 3) / 4), days - 1];
  const labels = labelIdxs.map(i => {
    const dt = new Date(dates[i] + "T00:00:00");
    return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  });
  return { line, area, hasData, labels };
}

export default function Home() {
  return (
    <AuthGate>
      {({ session, signOut }) => <Dashboard session={session} signOut={signOut} />}
    </AuthGate>
  );
}

function Dashboard({ session, signOut }: { session: Session; signOut: () => void }) {
  const [receipts, setReceipts] = useState<ReceiptResult[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("overview");
  const [showSettings, setShowSettings] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [search, setSearch] = useState("");
  const [reviewFilter, setReviewFilter] = useState(false);

  // Restore saved theme
  useEffect(() => {
    const saved = localStorage.getItem("sl-theme") as Theme | null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    document.body.classList.remove("theme-night", "theme-paper", "theme-slate");
    if (theme !== "light") document.body.classList.add(`theme-${theme}`);
    localStorage.setItem("sl-theme", theme);
  }, [theme]);

  useEffect(() => {
    Promise.all([
      api.get<ReceiptResult[]>("/api/v1/receipts"),
      api.get<Category[]>("/api/v1/categories"),
    ])
      .then(([r, c]) => { setReceipts(r); setCategories(c); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ---- derived ----
  const currency = receipts.find(r => r.currency === "ZMW") ? "K" : (receipts[0]?.currency ?? "K");
  const totalSpend = receipts.reduce((s, r) => s + (r.total_amount || 0), 0);
  const needsReview = receipts.filter(r => r.status === "needs_review" || r.confidence === "low");
  const categorized = receipts.filter(r => r.category_id);

  const topMerchant = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of receipts) if (r.merchant) map[r.merchant] = (map[r.merchant] || 0) + (r.total_amount || 0);
    return Object.entries(map).sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [receipts]);

  const catBreakdown = useMemo(() => {
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const totals: Record<string, { name: string; icon: string; amount: number; color: string }> = {};
    let idx = 0;
    for (const r of receipts) {
      const cat = r.category_id ? catMap[r.category_id] : null;
      const key = cat?.id ?? "__none__";
      if (!totals[key]) totals[key] = { name: cat?.name ?? "Uncategorised", icon: cat?.icon ?? "📎", amount: 0, color: CAT_COLORS[idx++ % CAT_COLORS.length] };
      totals[key].amount += r.total_amount || 0;
    }
    return Object.values(totals).sort((a, b) => b.amount - a.amount);
  }, [receipts, categories]);

  const topMerchants = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    for (const r of receipts) {
      if (r.merchant) {
        map[r.merchant] = map[r.merchant] ?? { count: 0, total: 0 };
        map[r.merchant].count++;
        map[r.merchant].total += r.total_amount || 0;
      }
    }
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [receipts]);

  const monthlyBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of receipts)
      if (r.purchase_date) {
        const m = r.purchase_date.substring(0, 7);
        map[m] = (map[m] || 0) + (r.total_amount || 0);
      }
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  }, [receipts]);

  const chart = useMemo(() => buildChart(receipts, 30), [receipts]);

  const filteredReceipts = useMemo(() => {
    let list = receipts;
    if (reviewFilter) list = list.filter(r => r.status === "needs_review" || r.confidence === "low");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.merchant?.toLowerCase().includes(q) ||
        r.purchase_date?.includes(q) ||
        r.currency.toLowerCase().includes(q)
      );
    }
    return list;
  }, [receipts, reviewFilter, search]);

  // ---- actions ----
  const [generatingPdf, setGeneratingPdf] = useState(false);

  async function handleExportPDF() {
    setGeneratingPdf(true);
    try {
      const blob = await api.postForBlob("/api/v1/reports");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kuachaflo-report-${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not generate the report");
    } finally {
      setGeneratingPdf(false);
    }
  }

  function handleExport() {
    const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
    const headers = ["ID", "Merchant", "Date", "Total", "Currency", "Category", "Status", "Confidence", "Created"];
    const rows = receipts.map(r => [
      r.id, r.merchant ?? "", r.purchase_date ?? "",
      r.total_amount?.toFixed(2) ?? "", r.currency,
      r.category_id ? (catMap[r.category_id] ?? "") : "",
      r.status, r.confidence ?? "", r.created_at.split("T")[0],
    ]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kuachaflo-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function navigate(v: View, filter = false) {
    setView(v);
    setReviewFilter(filter);
    setSearch("");
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayStr = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const displayName =
    (session.user.user_metadata?.full_name as string | undefined) ||
    (session.user.user_metadata?.name as string | undefined) ||
    session.user.email?.split("@")[0] ||
    "there";
  const avatarLetter = displayName.charAt(0).toUpperCase();

  const navItems: { id: View; icon: string; label: string }[] = [
    { id: "overview", icon: "⌂", label: "Overview" },
    { id: "receipts", icon: "▤", label: "Receipts" },
    { id: "reports", icon: "◫", label: "Reports" },
    { id: "insights", icon: "◌", label: "Insights" },
  ];

  // ---- shared chart SVG ----
  const ChartSVG = ({ height = 205 }: { height?: number }) => (
    chart.hasData ? (
      <div className="chart" style={{ height }}>
        <div className="gridline a" /><div className="gridline b" />
        <div className="gridline c" /><div className="gridline d" />
        <svg viewBox="0 0 700 180" preserveAspectRatio="none">
          <defs>
            <linearGradient id="cg" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#a9c85f" stopOpacity=".28" />
              <stop offset="1" stopColor="#a9c85f" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={chart.area} fill="url(#cg)" />
          <path d={chart.line} fill="none" stroke="#4d613e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="chart-labels">{chart.labels.map((l, i) => <span key={i}>{l}</span>)}</div>
      </div>
    ) : (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: "11px" }}>
        Add receipts with dates to see your spending rhythm.
      </div>
    )
  );

  return (
    <>
      <div className="app">
        {/* ═══ SIDEBAR ═══ */}
        <aside className="sidebar">
          <div className="brand">
            <div className="logo">KF</div>
            <div><strong>KuachaFlo</strong></div>
          </div>
          <nav className="nav">
            {navItems.map(n => (
              <button key={n.id} className={view === n.id ? "active" : ""} onClick={() => navigate(n.id)}>
                <span className="icon">{n.icon}</span>{n.label}
              </button>
            ))}
            <button onClick={() => setShowSettings(true)}>
              <span className="icon">⚙</span>Appearance
            </button>
          </nav>
          <div className="sidebar-bottom">
            <div className="plan-card">
              <div className="plan-top"><span>Plan</span><span>Free</span></div>
              <div className="plan-value">{receipts.length} of 100 receipts</div>
              <div className="plan-meter">
                <i style={{ width: `${Math.min(100, receipts.length)}%` }} />
              </div>
              <div className="plan-foot">
                <span>{100 - receipts.length} remaining</span>
                <span>{new Date().toLocaleDateString("en-GB", { month: "long" })}</span>
              </div>
            </div>
            <button
              className="user-chip"
              onClick={signOut}
              title="Sign out"
              style={{ background: "none", font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer", width: "100%" }}
            >
              <div className="avatar">{avatarLetter}</div>
              <div><strong>{displayName}</strong><small>{session.user.email}</small></div>
            </button>
          </div>
        </aside>

        <main className="main">

          {/* ══════════════════════════════════════
              OVERVIEW
          ══════════════════════════════════════ */}
          {view === "overview" && (
            <>
              <div className="topbar">
                <div>
                  <div className="kicker">{todayStr}</div>
                  <h1>{greeting}, {displayName}.</h1>
                  <p className="subtitle">Your money, at a glance.</p>
                </div>
                <div className="actions">
                  <button className="btn secondary" onClick={handleExport} disabled={receipts.length === 0}>Export CSV</button>
                  <button className="btn lime" onClick={() => setShowCapture(true)}>＋ Add receipt</button>
                </div>
              </div>

              <section className="grid">
                {/* Stats */}
                <div className="card stat">
                  <div className="label"><span>Total spend</span><span>↗</span></div>
                  <div className="value">{fmt(totalSpend, currency)}</div>
                  <div className="sub">across {receipts.length} receipt{receipts.length !== 1 ? "s" : ""}</div>
                </div>
                <div className="card stat">
                  <div className="label"><span>Receipts</span><span>◫</span></div>
                  <div className="value">{receipts.length}</div>
                  <div className="sub">{needsReview.length} need review</div>
                </div>
                <div className="card stat">
                  <div className="label"><span>Categorised</span><span>✓</span></div>
                  <div className="value">{receipts.length > 0 ? Math.round((categorized.length / receipts.length) * 100) : 0}%</div>
                  <div className="sub">{categorized.length} of {receipts.length}</div>
                </div>
                <div className="card stat" style={{ cursor: topMerchant ? "pointer" : "default" }} onClick={() => topMerchant && navigate("insights")}>
                  <div className="label"><span>Top merchant</span><span>⌁</span></div>
                  <div className="value" style={{ fontSize: topMerchant && topMerchant[0].length > 9 ? "20px" : undefined }}>
                    {topMerchant ? topMerchant[0] : "—"}
                  </div>
                  <div className="sub">{topMerchant ? fmt(topMerchant[1], currency) : "No data yet"}</div>
                </div>

                {/* Capture CTA */}
                <div className="card capture" style={{ cursor: "pointer" }} onClick={() => setShowCapture(true)}>
                  <div className="capture-copy">
                    <div className="kicker" style={{ color: "#5b6a37" }}>Fast capture</div>
                    <h2>One photo. Done.</h2>
                    <p>Snap the receipt and let OCR do the rest.</p>
                    <button className="btn primary" onClick={e => { e.stopPropagation(); setShowCapture(true); }}>
                      Add receipt
                    </button>
                  </div>
                  <div className="capture-card">
                    <span style={{ fontSize: "9px", fontWeight: 850 }}>RECEIPT</span>
                    <div style={{ height: "8px" }} />
                    <div style={{ height: "5px", background: "#e1e3dd", borderRadius: "4px", marginBottom: "8px" }} />
                    <div style={{ height: "5px", background: "#e1e3dd", borderRadius: "4px", width: "78%", marginBottom: "8px" }} />
                    <div style={{ height: "5px", background: "#e1e3dd", borderRadius: "4px", width: "62%", marginBottom: "8px" }} />
                    <div style={{ height: "12px" }} />
                    <div style={{ height: "7px", background: "#c7cac0", borderRadius: "4px", width: "55%" }} />
                    <div className="scan-line" />
                  </div>
                </div>

                {/* Recent receipts */}
                <div className="card recent">
                  <div className="section-head">
                    <h2>Recent</h2>
                    <button
                      className="muted-link"
                      style={{ background: "none", border: "none", cursor: "pointer" }}
                      onClick={() => navigate("receipts")}
                    >
                      All receipts →
                    </button>
                  </div>
                  {loading ? (
                    <div style={{ padding: "30px", textAlign: "center", color: "var(--muted)", fontSize: "11px" }}>Loading…</div>
                  ) : (
                    <ReceiptList
                      receipts={receipts.slice(0, 5)}
                      categories={categories}
                      onUpdated={u => setReceipts(p => p.map(r => r.id === u.id ? u : r))}
                      onDeleted={id => setReceipts(p => p.filter(r => r.id !== id))}
                    />
                  )}
                </div>

                {/* Spending chart */}
                <div className="card analytics">
                  <div className="section-head">
                    <h2>Spending rhythm</h2>
                    <button className="muted-link" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => navigate("insights")}>
                      Details →
                    </button>
                  </div>
                  <ChartSVG />
                </div>

                {/* Category breakdown */}
                <div className="card breakdown">
                  <div className="section-head">
                    <h2>Categories</h2>
                    <button className="muted-link" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => navigate("insights")}>
                      Details →
                    </button>
                  </div>
                  {catBreakdown.length === 0 ? (
                    <div style={{ padding: "16px 0", color: "var(--muted)", fontSize: "10px" }}>
                      Assign categories to receipts to see the breakdown.
                    </div>
                  ) : catBreakdown.map(c => (
                    <div key={c.name} className="breakdown-item">
                      <span className="dot" style={{ background: c.color }} />
                      <div>
                        <strong>{c.icon} {c.name}</strong>
                        <small>{fmt(c.amount, currency)} · {totalSpend > 0 ? Math.round((c.amount / totalSpend) * 100) : 0}%</small>
                        <div className="bar"><i style={{ width: `${totalSpend > 0 ? Math.round((c.amount / totalSpend) * 100) : 0}%`, background: c.color }} /></div>
                      </div>
                    </div>
                  ))}
                </div>

                {needsReview.length > 0 && (
                  <div className="card nudge">
                    <div>
                      <strong>{needsReview.length} receipt{needsReview.length !== 1 ? "s" : ""} need review</strong>
                      <span>Fields marked uncertain.</span>
                    </div>
                    <button className="btn" onClick={() => navigate("receipts", true)}>Review</button>
                  </div>
                )}
              </section>
            </>
          )}

          {/* ══════════════════════════════════════
              RECEIPTS
          ══════════════════════════════════════ */}
          {view === "receipts" && (
            <>
              <div className="topbar">
                <div>
                  <div className="kicker">{receipts.length} total · {needsReview.length} need review</div>
                  <h1>Receipts</h1>
                </div>
                <div className="actions">
                  <input
                    type="search"
                    placeholder="Search…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                      padding: "9px 13px", borderRadius: "11px", border: "1px solid var(--line)",
                      background: "var(--surface)", fontSize: "12px", color: "var(--ink)",
                      outline: "none", width: "180px",
                    }}
                  />
                  <button className="btn lime" onClick={() => setShowCapture(true)}>＋ Add receipt</button>
                </div>
              </div>

              <div style={{ display: "flex", gap: "6px", marginTop: "18px" }}>
                {[
                  { label: "All", filter: false, count: receipts.length },
                  { label: "Needs review", filter: true, count: needsReview.length },
                ].map(tab => (
                  <button
                    key={tab.label}
                    onClick={() => setReviewFilter(tab.filter)}
                    style={{
                      padding: "6px 13px", borderRadius: "9px", fontSize: "11px", fontWeight: 750, cursor: "pointer",
                      background: reviewFilter === tab.filter ? "var(--ink)" : "var(--surface)",
                      color: reviewFilter === tab.filter ? "#fff" : "var(--muted)",
                      border: "1px solid var(--line)",
                    }}
                  >
                    {tab.label} <span style={{ opacity: 0.65 }}>({tab.count})</span>
                  </button>
                ))}
              </div>

              <div className="card" style={{ marginTop: "14px", padding: "0 20px" }}>
                {loading ? (
                  <div style={{ padding: "50px", textAlign: "center", color: "var(--muted)", fontSize: "11px" }}>Loading…</div>
                ) : filteredReceipts.length === 0 ? (
                  <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)", fontSize: "11px" }}>
                    {search ? "No receipts match." : reviewFilter ? "Nothing needs review." : "No receipts yet — add your first one."}
                  </div>
                ) : (
                  <ReceiptList
                    receipts={filteredReceipts}
                    categories={categories}
                    onUpdated={u => setReceipts(p => p.map(r => r.id === u.id ? u : r))}
                    onDeleted={id => setReceipts(p => p.filter(r => r.id !== id))}
                  />
                )}
              </div>
            </>
          )}

          {/* ══════════════════════════════════════
              REPORTS
          ══════════════════════════════════════ */}
          {view === "reports" && (
            <>
              <div className="topbar">
                <div>
                  <div className="kicker">Export & summaries</div>
                  <h1>Reports</h1>
                </div>
                <div className="actions">
                  <button className="btn secondary" onClick={handleExportPDF} disabled={receipts.length === 0 || generatingPdf}>
                    {generatingPdf ? "Generating…" : "↓ Download PDF"}
                  </button>
                  <button className="btn lime" onClick={handleExport} disabled={receipts.length === 0}>
                    ↓ Download CSV
                  </button>
                </div>
              </div>

              <section className="grid">
                <div className="card stat">
                  <div className="label"><span>Total spend</span></div>
                  <div className="value">{fmt(totalSpend, currency)}</div>
                  <div className="sub">{receipts.length} receipts</div>
                </div>
                <div className="card stat">
                  <div className="label"><span>Avg per receipt</span></div>
                  <div className="value">{fmt(receipts.length > 0 ? totalSpend / receipts.length : 0, currency)}</div>
                  <div className="sub">per transaction</div>
                </div>
                <div className="card stat">
                  <div className="label"><span>Categorised</span></div>
                  <div className="value">{categorized.length}</div>
                  <div className="sub">{receipts.length - categorized.length} uncategorised</div>
                </div>
                <div className="card stat" style={{ cursor: needsReview.length > 0 ? "pointer" : "default" }} onClick={() => needsReview.length > 0 && navigate("receipts", true)}>
                  <div className="label"><span>Needs review</span></div>
                  <div className="value">{needsReview.length}</div>
                  <div className="sub">{needsReview.length > 0 ? "Tap to review →" : "All good"}</div>
                </div>

                {/* Monthly table */}
                <div className="card" style={{ gridColumn: "span 6", padding: "20px" }}>
                  <div className="section-head"><h2>By month</h2></div>
                  {monthlyBreakdown.length === 0 ? (
                    <div style={{ padding: "30px 0", textAlign: "center", color: "var(--muted)", fontSize: "11px" }}>
                      No data yet. Add receipts with dates.
                    </div>
                  ) : (
                    <div className="table">
                      <div className="row header" style={{ gridTemplateColumns: "1.4fr .8fr .8fr" }}>
                        <div>Month</div><div>Receipts</div><div>Total</div>
                      </div>
                      {monthlyBreakdown.map(([month, total]) => {
                        const count = receipts.filter(r => r.purchase_date?.startsWith(month)).length;
                        const label = new Date(month + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
                        return (
                          <div key={month} className="row" style={{ gridTemplateColumns: "1.4fr .8fr .8fr" }}>
                            <div style={{ fontWeight: 750, fontSize: "11px" }}>{label}</div>
                            <div className="empty">{count}</div>
                            <div className="amount">{fmt(total, currency)}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Category table */}
                <div className="card" style={{ gridColumn: "span 6", padding: "20px" }}>
                  <div className="section-head"><h2>By category</h2></div>
                  {catBreakdown.length === 0 ? (
                    <div style={{ padding: "30px 0", textAlign: "center", color: "var(--muted)", fontSize: "11px" }}>
                      Assign categories to receipts to see the breakdown.
                    </div>
                  ) : (
                    <div className="table">
                      <div className="row header" style={{ gridTemplateColumns: "1.4fr .6fr .8fr" }}>
                        <div>Category</div><div>Share</div><div>Total</div>
                      </div>
                      {catBreakdown.map(c => (
                        <div key={c.name} className="row" style={{ gridTemplateColumns: "1.4fr .6fr .8fr" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.color, display: "inline-block", flexShrink: 0 }} />
                            <span style={{ fontWeight: 750, fontSize: "11px" }}>{c.name}</span>
                          </div>
                          <div className="empty">{totalSpend > 0 ? Math.round((c.amount / totalSpend) * 100) : 0}%</div>
                          <div className="amount">{fmt(c.amount, currency)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {/* ══════════════════════════════════════
              INSIGHTS
          ══════════════════════════════════════ */}
          {view === "insights" && (
            <>
              <div className="topbar">
                <div>
                  <div className="kicker">Spending analysis · 30 days</div>
                  <h1>Insights</h1>
                </div>
                <div className="actions">
                  <button className="btn secondary" onClick={handleExport} disabled={receipts.length === 0}>Export CSV</button>
                  <button className="btn lime" onClick={() => setShowCapture(true)}>＋ Add receipt</button>
                </div>
              </div>

              <section className="grid">
                {/* Full chart */}
                <div className="card analytics" style={{ gridColumn: "span 12" }}>
                  <div className="section-head">
                    <h2>Spending over 30 days</h2>
                    <span className="muted-link">{fmt(totalSpend, currency)} total</span>
                  </div>
                  <ChartSVG height={260} />
                </div>

                {/* Top merchants */}
                <div className="card" style={{ gridColumn: "span 6", padding: "20px" }}>
                  <div className="section-head"><h2>Top merchants</h2></div>
                  {topMerchants.length === 0 ? (
                    <div style={{ padding: "30px 0", textAlign: "center", color: "var(--muted)", fontSize: "11px" }}>
                      No merchant data yet.
                    </div>
                  ) : topMerchants.map((m, i) => {
                    const pct = topMerchants[0].total > 0 ? (m.total / topMerchants[0].total) * 100 : 0;
                    return (
                      <div key={m.name} style={{ display: "flex", gap: "10px", alignItems: "center", margin: "12px 0" }}>
                        <div style={{
                          width: "28px", height: "28px", borderRadius: "9px", background: "var(--surface-2)",
                          display: "grid", placeItems: "center", fontSize: "9px", fontWeight: 850, flexShrink: 0,
                        }}>
                          {m.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                            <strong style={{ fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</strong>
                            <span style={{ fontSize: "11px", fontWeight: 850, flexShrink: 0, marginLeft: "8px" }}>{fmt(m.total, currency)}</span>
                          </div>
                          <div className="bar"><i style={{ width: `${pct}%`, background: CAT_COLORS[i % CAT_COLORS.length] }} /></div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Category breakdown */}
                <div className="card breakdown" style={{ gridColumn: "span 6" }}>
                  <div className="section-head"><h2>Categories</h2></div>
                  {catBreakdown.length === 0 ? (
                    <div style={{ padding: "16px 0", color: "var(--muted)", fontSize: "10px" }}>
                      Assign categories to receipts to see breakdown.
                    </div>
                  ) : catBreakdown.map(c => (
                    <div key={c.name} className="breakdown-item">
                      <span className="dot" style={{ background: c.color }} />
                      <div>
                        <strong>{c.icon} {c.name}</strong>
                        <small>{fmt(c.amount, currency)} · {totalSpend > 0 ? Math.round((c.amount / totalSpend) * 100) : 0}%</small>
                        <div className="bar"><i style={{ width: `${totalSpend > 0 ? Math.round((c.amount / totalSpend) * 100) : 0}%`, background: c.color }} /></div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      {/* Mobile nav */}
      <nav className="mobile-nav">
        {navItems.map(n => (
          <button key={n.id} className={view === n.id ? "active" : ""} onClick={() => navigate(n.id)}>
            {n.icon}<br />{n.label}
          </button>
        ))}
        <button onClick={() => setShowCapture(true)}>＋<br />Add</button>
      </nav>

      {/* ══ SETTINGS OVERLAY (theme only) ══ */}
      {showSettings && (
        <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) setShowSettings(false); }}>
          <div className="sheet" style={{ maxWidth: "460px" }}>
            <div className="sheet-head">
              <div>
                <div className="kicker">Appearance</div>
                <h3>Theme</h3>
              </div>
              <button className="close" onClick={() => setShowSettings(false)}>×</button>
            </div>
            <div className="presets">
              {([
                { id: "light" as Theme, label: "Studio", sub: "Warm light", bg: "#f4f3ee" },
                { id: "paper" as Theme, label: "Paper", sub: "Soft, tactile", bg: "#efe9dc" },
                { id: "slate" as Theme, label: "Slate", sub: "Cool & crisp", bg: "#e9edf0" },
                { id: "night" as Theme, label: "Night", sub: "Low-light", bg: "#101415" },
              ]).map(t => (
                <button key={t.id} className={`preset ${theme === t.id ? "active" : ""}`} onClick={() => setTheme(t.id)}>
                  <div className="preview-swatch" style={{ background: t.bg }} />
                  <strong>{t.label}</strong>
                  <small>{t.sub}</small>
                </button>
              ))}
            </div>
            <div className="sheet-actions">
              <small>Saved locally on this device.</small>
              <button className="btn primary" onClick={() => setShowSettings(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CAPTURE OVERLAY ══ */}
      {showCapture && (
        <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) setShowCapture(false); }}>
          <div className="sheet" style={{ maxWidth: "610px" }}>
            <CameraUpload
              onClose={() => setShowCapture(false)}
              onProcessed={r => {
                setReceipts(p => [r, ...p]);
                setShowCapture(false);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
