import { supabase } from "./supabase";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type PaymentRequest = {
  id: string;
  plan_requested: string;
  amount: number;
  currency: string;
  momo_network: string;
  momo_reference: string;
  status: string;
  created_at: string;
};

export type WhatsAppLinkCode = {
  code: string;
  expires_in_minutes: number;
  whatsapp_number: string;
  already_linked: boolean;
};

async function authed(path: string, init?: RequestInit): Promise<Response> {
  if (!API_BASE) {
    throw new ApiError(0, "The API isn't connected yet — set NEXT_PUBLIC_API_URL.");
  }
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new ApiError(401, "Sign in first.");
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
  } catch {
    throw new ApiError(0, "Couldn't reach the server — check your connection and try again.");
  }
  return res;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string" && body.detail) return body.detail;
  } catch {
    /* keep the fallback */
  }
  return fallback;
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    throw new ApiError(res.status, await errorMessage(res, fallback));
  }
  return (await res.json()) as T;
}

export async function submitPaymentRequest(input: {
  plan_requested: string;
  amount: number;
  currency: string;
  momo_network: string;
  momo_reference: string;
  momo_sender_number: string | null;
}): Promise<PaymentRequest> {
  const res = await authed("/api/v1/billing/payment-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return json<PaymentRequest>(res, "Couldn't submit — try again.");
}

export async function listMyPaymentRequests(): Promise<PaymentRequest[]> {
  const res = await authed("/api/v1/billing/payment-requests");
  return json<PaymentRequest[]>(res, "Couldn't load your requests.");
}

export async function requestLinkCode(): Promise<WhatsAppLinkCode> {
  const res = await authed("/api/v1/account/whatsapp/link-code", { method: "POST" });
  return json<WhatsAppLinkCode>(res, "Couldn't reach the server — try again in a moment.");
}

export async function unlinkWhatsApp(): Promise<void> {
  const res = await authed("/api/v1/account/whatsapp/link", { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    throw new ApiError(res.status, await errorMessage(res, "Couldn't unlink — try again."));
  }
}
