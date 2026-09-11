"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { api, ApiError, needsSession } from "@/lib/client-api";
import { SessionRecovery } from "@/components/session-recovery";
import type {
  Entity,
  Profile,
  RecordData,
  Resource,
  Workspace,
  MutationResult,
} from "@/lib/types";
export { api } from "@/lib/client-api";

type Toast = { id: number; message: string; type: "success" | "error" };
export type SyncState =
  | "ready"
  | "syncing"
  | "offline"
  | "error"
  | "session-expired";
type Context = {
  data: Workspace | null;
  loading: boolean;
  error: string;
  syncState: SyncState;
  lastSyncedAt: Date | null;
  refresh: () => Promise<void>;
  reconnect: () => void;
  saveRecord: (
    resource: Resource,
    values: RecordData,
    id?: string,
    options?: { successMessage?: string; silent?: boolean },
  ) => Promise<Entity>;
  deleteRecord: (resource: Resource, id: string) => Promise<void>;
  saveProfile: (input: Record<string, unknown>) => Promise<Profile>;
  notify: (message: string, type?: "success" | "error") => void;
};
const ShopContext = createContext<Context | null>(null);
const messageOf = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "We couldn’t connect. Please try again.";

export function ShopProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [data, setData] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("ready");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dataRef = useRef<Workspace | null>(null);
  const revision = useRef(0);
  const pendingCount = useRef(0);
  const refreshRequest = useRef<{
    controller: AbortController;
    promise: Promise<void>;
  } | null>(null);
  const requestKeys = useRef(new Map<string, string>());
  const profileQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingSaves = useRef(new Map<string, Promise<Entity>>());
  const pendingDeletes = useRef(new Map<string, Promise<void>>());
  const updateData = useCallback(
    (update: (current: Workspace | null) => Workspace | null) => {
      const next = update(dataRef.current);
      dataRef.current = next;
      setData(next);
    },
    [],
  );
  const notify = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      const id = Date.now() + Math.random();
      setToasts((items) => [...items.slice(-3), { id, message, type }]);
      window.setTimeout(
        () => setToasts((items) => items.filter((t) => t.id !== id)),
        5500,
      );
    },
    [],
  );
  const reportConnectionError = useCallback((failure: unknown) => {
    setError(messageOf(failure));
    if (needsSession(failure)) {
      setSyncState("session-expired");
      setRecoveryOpen(true);
    } else {
      setSyncState(navigator.onLine ? "error" : "offline");
    }
  }, []);
  const workspaceHeaders = (): Record<string, string> =>
    dataRef.current ? { "X-KraTte-Workspace": dataRef.current.user.id } : {};

  const loadWorkspace = useCallback(
    (force = false): Promise<void> => {
      if (refreshRequest.current && !force)
        return refreshRequest.current.promise;
      if (force) refreshRequest.current?.controller.abort();
      const controller = new AbortController();
      const startRevision = revision.current;
      if (!dataRef.current) setLoading(true);
      setSyncState("syncing");
      const promise = (async () => {
        try {
          const next = await api<Workspace>("/api/workspace", {
            signal: controller.signal,
            headers: dataRef.current
              ? { "X-KraTte-Workspace": dataRef.current.user.id }
              : undefined,
          });
          // A slow background response must never replace a newer local edit.
          if (
            !controller.signal.aborted &&
            startRevision === revision.current &&
            pendingCount.current === 0
          ) {
            updateData(() => next);
            setError("");
            setSyncState("ready");
            setLastSyncedAt(new Date());
          }
        } catch (failure) {
          if (controller.signal.aborted) return;
          reportConnectionError(failure);
          throw failure;
        } finally {
          if (refreshRequest.current?.controller === controller) {
            refreshRequest.current = null;
            setLoading(false);
          }
        }
      })();
      refreshRequest.current = { controller, promise };
      return promise;
    },
    [reportConnectionError, updateData],
  );
  const refresh = useCallback(() => loadWorkspace(), [loadWorkspace]);

  useEffect(() => {
    if (pathname === "/login") {
      setLoading(false);
      return;
    }
    if (!dataRef.current) void loadWorkspace().catch(() => {});
  }, [pathname, loadWorkspace]);
  useEffect(() => {
    const reconnect = () => {
      if (window.location.pathname !== "/login" && pendingCount.current === 0)
        void loadWorkspace(true).catch(() => {});
    };
    const offline = () => {
      setSyncState("offline");
      setError(
        "You’re offline. Your current view is still available; reconnect before making changes.",
      );
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", reconnect);
    return () => {
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", reconnect);
    };
  }, [loadWorkspace]);

  function retryKey(signature: string) {
    let key = requestKeys.current.get(signature);
    if (!key) {
      key = crypto.randomUUID();
      requestKeys.current.set(signature, key);
    }
    return key;
  }
  function beginMutation() {
    if (!navigator.onLine) {
      const failure = new ApiError(
        "You’re offline. Reconnect and retry; your form is still here.",
        0,
        "OFFLINE",
      );
      reportConnectionError(failure);
      throw failure;
    }
    if (!dataRef.current)
      throw new ApiError(
        "Reconnect to your workspace before saving.",
        401,
        "SESSION_EXPIRED",
      );
    pendingCount.current++;
    revision.current++;
    refreshRequest.current?.controller.abort();
  }
  function finishMutation(refreshAfter: boolean) {
    pendingCount.current--;
    revision.current++;
    // A refresh is separate from the committed operation. Its failure cannot undo a success.
    if (refreshAfter && pendingCount.current === 0)
      void loadWorkspace(true).catch(() => {});
  }
  function applyInventory(current: Workspace, changed: Entity[]) {
    if (!changed.length) return current.records.inventory;
    const byId = new Map(changed.map((product) => [product.id, product]));
    return current.records.inventory.map((product) => {
      const incoming = byId.get(product.id);
      return incoming && (incoming.version || 0) >= (product.version || 0)
        ? incoming
        : product;
    });
  }

  const saveRecord = (
    resource: Resource,
    values: RecordData,
    id?: string,
    options?: { successMessage?: string; silent?: boolean },
  ): Promise<Entity> => {
    const ownerId = dataRef.current?.user.id;
    const signature = JSON.stringify([ownerId, resource, id || "new", values]);
    const pending = pendingSaves.current.get(signature);
    if (pending) return pending;
    const operation = (async () => {
      beginMutation();
      const key = retryKey(signature);
      const tempId = id || crypto.randomUUID();
      const before = dataRef.current?.records[resource].find(
        (row) => row.id === id,
      );
      const optimistic: Entity = { ...before, ...values, id: tempId, resource };
      updateData((current) =>
        current
          ? {
              ...current,
              records: {
                ...current.records,
                [resource]: id
                  ? current.records[resource].map((row) =>
                      row.id === id ? optimistic : row,
                    )
                  : [optimistic, ...current.records[resource]],
              },
            }
          : current,
      );
      let saved = false;
      try {
        const result = await api<MutationResult>(
          `/api/records/${resource}${id ? `/${id}` : ""}`,
          {
            method: id ? "PATCH" : "POST",
            headers: { ...workspaceHeaders(), "Idempotency-Key": key },
            body: JSON.stringify(values),
          },
        );
        const record = result.record;
        if (!record?.id)
          throw new ApiError(
            "The save confirmation was interrupted. Retry this form to confirm it safely.",
            0,
            "INVALID_RESPONSE",
          );
        updateData((current) => {
          if (!current || current.user.id !== ownerId) return current;
          const nextRows = current.records[resource].filter(
            (row) => row.id !== tempId && row.id !== record.id,
          );
          return {
            ...current,
            records: {
              ...current.records,
              inventory: applyInventory(current, result.inventory || []),
              [resource]: [record, ...nextRows],
            },
          };
        });
        saved = true;
        requestKeys.current.delete(signature);
        setError("");
        setSyncState("ready");
        if (!options?.silent)
          notify(
            options?.successMessage ||
              (id
                ? "Changes saved successfully."
                : resource === "sales"
                  ? "Sale recorded. Inventory updated."
                  : "Added to your workspace."),
          );
        return record;
      } catch (failure) {
        if (
          failure instanceof ApiError &&
          failure.status >= 400 &&
          failure.status < 500 &&
          failure.status !== 408
        )
          requestKeys.current.delete(signature);
        // Roll back just this row, not unrelated changes elsewhere in the workspace.
        updateData((current) => {
          if (!current || current.user.id !== ownerId) return current;
          const latest = current.records[resource].find(
            (row) => row.id === tempId,
          );
          if (before && latest && (latest.version || 0) > (before.version || 0))
            return current;
          const rows = current.records[resource].filter(
            (row) => row.id !== tempId,
          );
          if (before) rows.unshift(before);
          return {
            ...current,
            records: { ...current.records, [resource]: rows },
          };
        });
        if (
          needsSession(failure) ||
          (failure instanceof ApiError &&
            (failure.status === 0 || failure.status >= 500))
        )
          reportConnectionError(failure);
        notify(messageOf(failure), "error");
        throw failure;
      } finally {
        finishMutation(saved);
      }
    })();
    pendingSaves.current.set(signature, operation);
    void operation
      .finally(() => pendingSaves.current.delete(signature))
      .catch(() => {});
    return operation;
  };

  const deleteRecord = (resource: Resource, id: string): Promise<void> => {
    const ownerId = dataRef.current?.user.id;
    const signature = JSON.stringify([ownerId, resource, id, "delete"]);
    const pending = pendingDeletes.current.get(signature);
    if (pending) return pending;
    const operation = (async () => {
      beginMutation();
      const key = retryKey(signature);
      const before = dataRef.current?.records[resource].find(
        (row) => row.id === id,
      );
      updateData((current) =>
        current
          ? {
              ...current,
              records: {
                ...current.records,
                [resource]: current.records[resource].filter(
                  (row) => row.id !== id,
                ),
              },
            }
          : current,
      );
      let saved = false;
      try {
        const result = await api<MutationResult>(
          `/api/records/${resource}/${id}`,
          {
            method: "DELETE",
            headers: { ...workspaceHeaders(), "Idempotency-Key": key },
          },
        );
        updateData((current) =>
          current && current.user.id === ownerId
            ? {
                ...current,
                records: {
                  ...current.records,
                  inventory: applyInventory(current, result.inventory || []),
                  [resource]: current.records[resource].filter(
                    (row) => row.id !== id,
                  ),
                },
              }
            : current,
        );
        saved = true;
        requestKeys.current.delete(signature);
        setError("");
        setSyncState("ready");
        notify("Record deleted successfully.");
      } catch (failure) {
        updateData((current) =>
          current && current.user.id === ownerId && before
            ? {
                ...current,
                records: {
                  ...current.records,
                  [resource]: [
                    before,
                    ...current.records[resource].filter((row) => row.id !== id),
                  ],
                },
              }
            : current,
        );
        if (
          needsSession(failure) ||
          (failure instanceof ApiError &&
            (failure.status === 0 || failure.status >= 500))
        )
          reportConnectionError(failure);
        notify(messageOf(failure), "error");
        throw failure;
      } finally {
        finishMutation(saved);
      }
    })();
    pendingDeletes.current.set(signature, operation);
    void operation
      .finally(() => pendingDeletes.current.delete(signature))
      .catch(() => {});
    return operation;
  };

  const saveProfile = (input: Record<string, unknown>): Promise<Profile> => {
    const ownerId = dataRef.current?.user.id;
    // Display preferences often change in quick succession. Preserve their order
    // and never merge a response into a different account's client state.
    const operation = profileQueue.current.then(async () => {
      if (!ownerId || dataRef.current?.user.id !== ownerId)
        throw new ApiError(
          "Reconnect to the same workspace before saving preferences.",
          409,
          "WORKSPACE_CHANGED",
        );
      beginMutation();
      let saved = false;
      try {
        const result = await api<{ user: Profile }>("/api/workspace", {
          method: "PATCH",
          headers: { "X-KraTte-Workspace": ownerId },
          body: JSON.stringify(input),
        });
        if (result.user.id !== ownerId)
          throw new ApiError(
            "The active workspace changed. Reload before continuing.",
            409,
            "WORKSPACE_CHANGED",
          );
        updateData((current) =>
          current?.user.id === ownerId
            ? { ...current, user: result.user }
            : current,
        );
        saved = true;
        return result.user;
      } catch (failure) {
        if (needsSession(failure)) reportConnectionError(failure);
        throw failure;
      } finally {
        finishMutation(saved);
      }
    });
    profileQueue.current = operation.then(
      () => {},
      () => {},
    );
    return operation;
  };
  const restoreSession = async (profile: Profile) => {
    const previous = dataRef.current;
    // Never transfer an open draft into somebody else's account.
    if (previous && previous.user.id !== profile.id) {
      window.location.reload();
      return;
    }
    updateData((current) =>
      current ? { ...current, user: profile } : current,
    );
    await loadWorkspace(true);
    setRecoveryOpen(false);
    notify("You’re reconnected. Your open form is ready to continue.");
  };

  return (
    <ShopContext.Provider
      value={{
        data,
        loading,
        error,
        syncState,
        lastSyncedAt,
        refresh,
        reconnect: () => setRecoveryOpen(true),
        saveRecord,
        deleteRecord,
        saveProfile,
        notify,
      }}
    >
      {children}
      {recoveryOpen && pathname !== "/login" && (
        <SessionRecovery
          profile={data?.user || null}
          message={error}
          onClose={() => setRecoveryOpen(false)}
          onRestored={restoreSession}
        />
      )}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast ${toast.type}`}
            role={toast.type === "error" ? "alert" : "status"}
          >
            {toast.type === "success" ? (
              <CheckCircle2 size={20} />
            ) : (
              <AlertCircle size={20} />
            )}
            <span>{toast.message}</span>
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() =>
                setToasts((items) => items.filter((t) => t.id !== toast.id))
              }
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ShopContext.Provider>
  );
}
export function useShop() {
  const context = useContext(ShopContext);
  if (!context) throw new Error("ShopProvider is required.");
  return context;
}
