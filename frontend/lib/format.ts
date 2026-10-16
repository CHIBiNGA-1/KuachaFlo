import { supabase } from "./supabase";

export function money(n: number, currency = "ZMW"): string {
  const v = n.toLocaleString("en-ZM", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === "ZMW" ? `K ${v}` : `${v} ${currency}`;
}

export function formatDay(iso: string): string {
  return new Date(iso + "T12:00").toLocaleDateString("en-ZM", {
    day: "numeric",
    month: "short",
  });
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Mirrors backend plan_limits (free 100 / pro 1000 / business unlimited). */
export const PLAN_LIMITS: Record<string, number | null> = {
  free: 100,
  pro: 1000,
  business: null,
};

export const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

export async function fetchMyPlan(): Promise<string> {
  // The plan name is a nice-to-have label; offline it falls back to the
  // last value seen on this device instead of erroring the whole screen.
  const remember = (plan: string) => {
    try {
      localStorage.setItem("kratte:plan", plan);
    } catch {
      /* private mode — fine */
    }
    return plan;
  };
  const lastKnown = () => {
    try {
      return localStorage.getItem("kratte:plan");
    } catch {
      return null;
    }
  };
  try {
    if (!supabase) throw new Error("Not configured — set the Supabase env vars.");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You're signed out — sign in again.");
    const { data, error } = await supabase.from("profiles").select("plan").eq("id", user.id).single();
    if (error) throw error;
    return remember((data as { plan: string }).plan || "free");
  } catch (e) {
    const cached = lastKnown();
    if (cached) return cached;
    throw e;
  }
}
