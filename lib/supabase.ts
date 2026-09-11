import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);

/** Null when env is missing — UI shows a setup hint instead of crashing. */
export const supabase: SupabaseClient | null =
  supabaseConfigured ? createClient(url!, key!) : null;

export type ServiceChoice = "personal" | "shop";

export type Profile = {
  id: string;
  service_choice: ServiceChoice | null;
  chosen_at: string | null;
};
