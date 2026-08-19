"use client";

import { useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { ReceiptResult } from "@/lib/types";

export type { ReceiptResult };

type Props = {
  onProcessed?: (receipt: ReceiptResult) => void;
  onClose: () => void;
};

type UploadState = "idle" | "uploading" | "done" | "error";

export function CameraUpload({ onProcessed, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ReceiptResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setState("idle");
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) { setError("Not an image file."); setState("error"); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Image is over 10 MB."); setState("error"); return; }

    setPreview(URL.createObjectURL(file));
    setState("uploading");
    setError(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post<ReceiptResult>("/api/v1/receipts", fd);
      setResult(r);
      setState("done");
      onProcessed?.(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setState("error");
    }
  }, [onProcessed]);

  return (
    <>
      <div className="sheet-head">
        <div>
          <div className="kicker">New receipt</div>
          <h3>Add a receipt.</h3>
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
          <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "4px" }}>JPG · PNG · WebP · up to 10 MB</div>
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
          <div style={{ padding: "12px 16px", fontSize: "11px", color: "var(--muted)", fontWeight: 750 }}>Reading receipt…</div>
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
        </div>
      )}

      <div className="sheet-actions">
        <small>OCR runs locally on this device.</small>
        {state === "done" ? (
          <button className="btn primary" onClick={onClose}>Done</button>
        ) : state === "error" ? (
          <button className="btn primary" onClick={reset}>Try again</button>
        ) : (
          <button className="btn primary" onClick={onClose} disabled={state === "uploading"}>Cancel</button>
        )}
      </div>
    </>
  );
}
