"use client";

import { useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { ReceiptResult } from "@/lib/types";

export type { ReceiptResult };

type Props = {
  onProcessed?: (receipt: ReceiptResult) => void;
  onClose: () => void;
};

type UploadState = "idle" | "uploading" | "question" | "done" | "error";

// LedgerEntryOut from the unified API — mapped to ReceiptResult below so
// the current Money/Overview screens keep working unchanged.
type LedgerEntry = {
  id: string;
  party: string | null;
  amount: number | null;
  occurred_on: string | null;
  currency: string;
  confidence: "high" | "medium" | "low" | null;
  thumbnail_path: string | null;
  image_path: string | null;
  status: "processed" | "failed" | "needs_review";
  category_id: string | null;
  created_at: string;
};

type IngestResult = {
  entry: LedgerEntry | null;
  draft_id: string | null;
  question: string | null;
  message: string | null;
};

function toReceipt(e: LedgerEntry): ReceiptResult {
  return {
    id: e.id,
    merchant: e.party,
    total_amount: e.amount,
    purchase_date: e.occurred_on,
    currency: e.currency,
    confidence: e.confidence,
    thumbnail_path: e.thumbnail_path,
    image_path: e.image_path,
    status: e.status,
    category_id: e.category_id,
    created_at: e.created_at,
  };
}

export function CameraUpload({ onProcessed, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ReceiptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [answering, setAnswering] = useState(false);

  const reset = useCallback(() => {
    setState("idle");
    setPreview(null);
    setResult(null);
    setError(null);
    setDraftId(null);
    setQuestion(null);
    setAnswer("");
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const finish = useCallback((entry: LedgerEntry) => {
    const r = toReceipt(entry);
    setResult(r);
    setState("done");
    onProcessed?.(r);
  }, [onProcessed]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) { setError("Not an image file."); setState("error"); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Image is over 10 MB."); setState("error"); return; }

    setPreview(URL.createObjectURL(file));
    setState("uploading");
    setError(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post<IngestResult>("/api/v1/ingest/photo", fd);
      if (r.entry) {
        finish(r.entry);
      } else if (r.draft_id && r.question) {
        setDraftId(r.draft_id);
        setQuestion(r.question);
        setState("question");
      } else {
        setError(r.message || "Couldn't make sense of that photo.");
        setState("error");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setState("error");
    }
  }, [finish]);

  const submitAnswer = useCallback(async () => {
    if (!draftId || !answer.trim() || answering) return;
    setAnswering(true);
    setError(null);
    try {
      const r = await api.post<LedgerEntry | IngestResult>("/api/v1/ingest/clarify", {
        draft_id: draftId, answer: answer.trim(),
      });
      if ("id" in r && (r as LedgerEntry).id) {
        finish(r as LedgerEntry);
      } else {
        const follow = r as IngestResult;
        if (follow.entry) finish(follow.entry);
        else if (follow.draft_id && follow.question) {
          setDraftId(follow.draft_id);
          setQuestion(follow.question);
          setAnswer("");
        } else {
          setError(follow.message || "Couldn't file that — try again.");
          setState("error");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that answer.");
      setState("error");
    } finally {
      setAnswering(false);
    }
  }, [draftId, answer, answering, finish]);

  const cancelDraft = useCallback(async () => {
    if (draftId) {
      try { await api.post("/api/v1/ingest/clarify", { draft_id: draftId, cancel: true }); } catch { /* best-effort */ }
    }
    reset();
  }, [draftId, reset]);

  return (
    <>
      <div className="sheet-head">
        <div>
          <div className="kicker">New entry</div>
          <h3>Add it.</h3>
          <p className="sheet-intro">Capture first. Review second.</p>
        </div>
        <button className="close" onClick={onClose}>×</button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

      {state === "idle" && (
        <div style={{ border: "1.5px dashed var(--line)", borderRadius: "19px", padding: "30px 18px", textAlign: "center", background: "var(--bg)", marginTop: "4px" }}>
          <div style={{ fontSize: "28px" }}>⌾</div>
          <div style={{ fontSize: "13px", fontWeight: 850, marginTop: "7px" }}>Choose a photo or use your camera</div>
          <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "4px" }}>Receipt · MoMo screenshot · sales sheet · up to 10 MB</div>
          <div style={{ display: "flex", justifyContent: "center", gap: "7px", marginTop: "15px" }}>
            <button className="btn lime" onClick={() => fileRef.current?.click()}>Choose image</button>
          </div>
        </div>
      )}

      {state === "uploading" && preview && (
        <div style={{ marginTop: "16px", borderRadius: "16px", overflow: "hidden", border: "1px solid var(--line)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview" style={{ width: "100%", maxHeight: "260px", objectFit: "cover", display: "block", opacity: 0.5 }} />
          <div className="skeleton" style={{ height: "4px", width: "100%", borderRadius: 0 }} />
          <div style={{ padding: "12px 16px", fontSize: "11px", color: "var(--muted)", fontWeight: 750 }}>Reading it…</div>
        </div>
      )}

      {state === "question" && (
        <div style={{ marginTop: "16px", borderRadius: "16px", border: "1px solid var(--line)", padding: "18px", background: "var(--surface)" }}>
          <div style={{ fontSize: "14px", fontWeight: 800 }}>{question}</div>
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <input
              type="text"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitAnswer(); }}
              placeholder="e.g. Lunch with a client"
              autoFocus
              style={{ flex: 1, padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--bg)", fontSize: "14px", color: "var(--ink)", outline: "none" }}
            />
            <button className="btn lime" onClick={submitAnswer} disabled={answering || !answer.trim()}>
              {answering ? "…" : "File it"}
            </button>
          </div>
          <button onClick={cancelDraft} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: "11px", fontWeight: 700, marginTop: "10px", cursor: "pointer", padding: 0 }}>
            Never mind — discard
          </button>
        </div>
      )}

      {state === "done" && result && preview && (
        <div style={{ marginTop: "16px", borderRadius: "16px", overflow: "hidden", border: "1px solid var(--line)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview" style={{ width: "100%", maxHeight: "260px", objectFit: "cover", display: "block" }} />
          <div style={{ padding: "14px 16px", background: "var(--surface)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 850, textTransform: "uppercase" }}>Merchant</div>
              <div style={{ fontWeight: 850, fontSize: "15px" }}>{result.merchant ?? "Unknown"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 850, textTransform: "uppercase" }}>Total</div>
              <div style={{ fontWeight: 880, fontSize: "18px" }}>
                {result.total_amount != null ? `${result.currency === "ZMW" ? "K" : result.currency} ${result.total_amount.toFixed(2)}` : "—"}
              </div>
            </div>
            <span className={`tag ${result.confidence === "high" ? "green" : result.confidence === "medium" ? "" : "orange"}`}>
              {result.confidence ?? "low"}
            </span>
          </div>
        </div>
      )}

      {state === "error" && (
        <div style={{ marginTop: "16px", padding: "16px", background: "var(--danger)", borderRadius: "14px", fontSize: "11px", color: "#6a1b1b" }}>
          {error}
          {error?.includes("402") && (
            <div style={{ marginTop: "8px" }}>
              <a href="/billing" style={{ color: "#6a1b1b", fontWeight: 700, textDecoration: "underline" }}>
                Upgrade your plan →
              </a>
            </div>
          )}
        </div>
      )}

      <div className="sheet-actions">
        <small>Read by AI · you confirm.</small>
        {state === "done" ? (
          <button className="btn primary" onClick={onClose}>Done</button>
        ) : state === "error" ? (
          <button className="btn primary" onClick={reset}>Try again</button>
        ) : state === "question" ? (
          <button className="btn primary" onClick={cancelDraft}>Cancel</button>
        ) : (
          <button className="btn primary" onClick={onClose} disabled={state === "uploading"}>Cancel</button>
        )}
      </div>
    </>
  );
}
