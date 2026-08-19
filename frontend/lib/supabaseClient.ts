import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  // Fails loudly at build/dev time rather than silently breaking auth later.
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
      "Set them in your .env — see .env.example."
  );
}

// This is the publishable/anon key — safe to ship to the browser by design,
// protected by Supabase's Row Level Security. Never put the secret/
// service_role key here.
export const supabase = createClient(url, publishableKey);
