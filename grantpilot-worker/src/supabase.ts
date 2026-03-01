import { config } from "dotenv";
import { resolve } from "path";

// Load env first (ESM hoists imports; index.ts config runs too late for this module)
config();
config({ path: resolve(process.cwd(), "..", ".env.local") });

import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getEnv(name: string, fallbackVar?: string): string {
  const v = process.env[name] ?? (fallbackVar ? process.env[fallbackVar] : undefined);
  if (!v) throw new Error(`Missing env var: ${name}${fallbackVar ? ` or ${fallbackVar}` : ""}`);
  return v;
}

export const SUPABASE_URL = getEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_SERVICE_ROLE_KEY = getEnv(
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY"
);

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
