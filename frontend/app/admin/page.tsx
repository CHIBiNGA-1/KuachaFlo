"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Lock,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { money } from "@/lib/format";
import {
  AdminError,
  clearStoredAdminKey,
  getStoredAdminKey,
  listPaymentRequests,
  listUsers,
  reviewPaymentRequest,
  setUserPlan,
  storeAdminKey,
  type AdminUser,
  type PaymentRequest,
} from "@/lib/admin";

/**
 * Not linked from the app's own navigation on purpose — shop staff should
 * never see an "Admin" tab. It's reachable only by URL
 * (kratte.vercel.app/admin) and by the key, same as the curl workflow it
 * replaces. Treat the URL itself as semi-private.
 */
export default function AdminPage() {
  const [key, setKey] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);

  // Try a stored key once on load, silently — no point making the
  // operator retype it every reload if it's still good.
  useEffect(() => {
    const stored = getStoredAdminKey();
    if (!stored) {
      setChecking(false);
      return;
    }
    listUsers(stored)
      .then(() => {
        setKey(stored);
        setUnlocked(true);
      })
      .catch(() => clearStoredAdminKey())
      .finally(() => setChecking(false));
  }, []);

  function lock() {
    clearStoredAdminKey();
    setKey("");
    setUnlocked(false);
  }

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper">
        <div className="animate-pulse text-[12px] font-bold text-muted">Checking…</div>
      </div>
    );
  }

  if (!unlocked) {
    return <KeyGate onUnlock={(k) => { setKey(k); setUnlocked(true); }} />;
  }

  return <Dashboard adminKey={key} onLock={lock} />;
}

// ── Gate ──────────────────────────────────────────────────────────────

function KeyGate({ onUnlock }: { onUnlock: (key: string) => void }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      // The real check IS the request — there's no separate client-side
      // notion of "logged in" to get out of sync with the server.
      await listUsers(trimmed);
      storeAdminKey(trimmed);
      onUnlock(trimmed);
    } catch (e) {
      setError(e instanceof AdminError ? e.message : "Couldn't verify that key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-5">
      <div className="card w-full max-w-sm p-8">
        <div
          className="grid h-11 w-11 place-items-center rounded-2xl"
          style={{ background: "var(--accent-wash)", color: "var(--accent-deep)" }}
        >
          <Lock size={19} />
        </div>
        <h1 className="mt-4 font-display text-2xl">Admin</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          The key from your Render environment (<code className="text-ink">ADMIN_API_KEY</code>).
          Held only for this browser tab — never saved, never sent anywhere but the API.
        </p>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
          <input
            className="field"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Admin key"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
          {error && (
            <div
              className="flex items-start gap-2 rounded-xl p-3 text-xs font-semibold"
              style={{ background: "var(--accent-wash)", color: "var(--red)" }}
            >
              <ShieldAlert size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <button className="btn btn-accent w-full" disabled={busy || !input.trim()}>
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────

function Dashboard({ adminKey, onLock }: { adminKey: string; onLock: () => void }) {
  const [tab, setTab] = useState<"users" | "payments">("payments");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [payments, setPayments] = useState<PaymentRequest[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<"pending" | "confirmed" | "rejected" | "">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, p] = await Promise.all([
        listUsers(adminKey),
        listPaymentRequests(adminKey, statusFilter || undefined),
      ]);
      setUsers(u);
      setPayments(p);
    } catch (e) {
      if (e instanceof AdminError && e.status === 401) return onLock();
      setError(e instanceof AdminError ? e.message : "Couldn't load admin data.");
    } finally {
      setLoading(false);
    }
  }, [adminKey, statusFilter, onLock]);

  useEffect(() => {
    load();
  }, [load]);

  async function changePlan(userId: string, plan: AdminUser["plan"]) {
    setBusyId(userId);
    try {
      const updated = await setUserPlan(adminKey, userId, plan);
      setUsers((list) => list?.map((u) => (u.id === userId ? updated : u)) ?? list);
    } catch (e) {
      setError(e instanceof AdminError ? e.message : "Couldn't update the plan.");
    } finally {
      setBusyId(null);
    }
  }

  async function review(requestId: string, action: "confirm" | "reject") {
    setBusyId(requestId);
    try {
      await reviewPaymentRequest(adminKey, requestId, action);
      await load();
    } catch (e) {
      setError(e instanceof AdminError ? e.message : "Couldn't submit that review.");
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = payments?.filter((p) => p.status === "pending").length ?? 0;

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="kicker">Operator only</div>
            <h1 className="mt-1 font-display text-[28px] tracking-tight">Admin</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={load} disabled={loading} aria-label="Refresh">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button className="btn" onClick={onLock}>
              <LogOut size={14} />
              Lock
            </button>
          </div>
        </div>

        <div className="shelf-tabs mt-6">
          <button className={tab === "payments" ? "active" : ""} onClick={() => setTab("payments")}>
            <Wallet size={14} />
            Payment claims
            {pendingCount > 0 && <span className="warn">{pendingCount}</span>}
          </button>
          <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
            <Users size={14} />
            Users
            <span>{users?.length ?? 0}</span>
          </button>
        </div>

        {error && (
          <div
            className="mt-4 flex items-center justify-between gap-3 rounded-xl p-3.5 text-[12.5px] font-semibold"
            style={{ background: "var(--accent-wash)", color: "var(--red)" }}
          >
            {error}
            <button onClick={() => setError(null)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="mt-5">
          {tab === "payments" ? (
            <PaymentsPanel
              payments={payments}
              loading={loading}
              busyId={busyId}
              statusFilter={statusFilter}
              onFilter={setStatusFilter}
              onReview={review}
            />
          ) : (
            <UsersPanel users={users} loading={loading} busyId={busyId} onChangePlan={changePlan} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Payment claims ───────────────────────────────────────────────────

function PaymentsPanel({
  payments,
  loading,
  busyId,
  statusFilter,
  onFilter,
  onReview,
}: {
  payments: PaymentRequest[] | null;
  loading: boolean;
  busyId: string | null;
  statusFilter: "pending" | "confirmed" | "rejected" | "";
  onFilter: (s: "pending" | "confirmed" | "rejected" | "") => void;
  onReview: (id: string, action: "confirm" | "reject") => void;
}) {
  return (
    <div>
      <div className="shelf-chips">
        {(["pending", "confirmed", "rejected", ""] as const).map((s) => (
          <button key={s || "all"} className={statusFilter === s ? "active" : ""} onClick={() => onFilter(s)}>
            {s || "All"}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3">
        {loading && !payments ? (
          <div className="animate-pulse rounded-2xl" style={{ height: 200, background: "var(--surface-2)" }} />
        ) : payments?.length === 0 ? (
          <div className="card p-10 text-center text-[13px] text-muted">
            No {statusFilter || ""} claims.
          </div>
        ) : (
          payments?.map((p) => (
            <div key={p.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold">{p.user_email}</div>
                  <div className="mt-0.5 text-[11.5px] text-muted">
                    wants <strong className="text-ink">{p.plan_requested}</strong> ·{" "}
                    {new Date(p.created_at).toLocaleString()}
                  </div>
                </div>
                <strong className="tnum shrink-0 text-[14px]">{money(p.amount, p.currency)}</strong>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
                <span>
                  Via <strong className="text-ink">{p.momo_network.toUpperCase()}</strong>
                </span>
                <span>
                  Ref <code className="text-ink">{p.momo_reference}</code>
                </span>
                {p.momo_sender_number && <span>From {p.momo_sender_number}</span>}
              </div>

              {p.status === "pending" ? (
                <div className="mt-3 flex gap-2">
                  <button
                    className="btn btn-accent flex-1"
                    disabled={busyId === p.id}
                    onClick={() => onReview(p.id, "confirm")}
                  >
                    <Check size={14} />
                    Confirm → sets {p.plan_requested}
                  </button>
                  <button className="btn" disabled={busyId === p.id} onClick={() => onReview(p.id, "reject")}>
                    <X size={14} />
                    Reject
                  </button>
                </div>
              ) : (
                <div
                  className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-bold"
                  style={{ color: p.status === "confirmed" ? "var(--green)" : "var(--red)" }}
                >
                  {p.status === "confirmed" ? <Check size={13} /> : <X size={13} />}
                  {p.status === "confirmed" ? "Confirmed" : "Rejected"}
                  {p.reviewed_at && ` · ${new Date(p.reviewed_at).toLocaleDateString()}`}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Users ─────────────────────────────────────────────────────────────

function UsersPanel({
  users,
  loading,
  busyId,
  onChangePlan,
}: {
  users: AdminUser[] | null;
  loading: boolean;
  busyId: string | null;
  onChangePlan: (id: string, plan: AdminUser["plan"]) => void;
}) {
  if (loading && !users) {
    return <div className="animate-pulse rounded-2xl" style={{ height: 240, background: "var(--surface-2)" }} />;
  }
  if (!users?.length) {
    return <div className="card p-10 text-center text-[13px] text-muted">No users yet.</div>;
  }

  return (
    <div className="shelf-table-wrap">
      <table className="shelf-table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Plan</th>
            <th>Ledger entries</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                <div className="font-semibold">{u.email || "—"}</div>
                <div className="text-[10.5px] text-muted">{u.id}</div>
              </td>
              <td>
                <select
                  className="shelf-tool"
                  value={u.plan}
                  disabled={busyId === u.id}
                  onChange={(e) => onChangePlan(u.id, e.target.value as AdminUser["plan"])}
                >
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="business">Business</option>
                </select>
              </td>
              <td className="tnum">{u.entry_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
