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

let _client: SupabaseClient | null = null;

/**
 * Lazy Supabase client so we don't throw at import (avoids crash before HTTP server listens).
 * Call getSupabase() when you need the client; throws only on first use if env is missing.
 */
export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = getEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
    const key = getEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_SERVICE_KEY"
    );
    _client = createClient(url, key, { auth: { persistSession: false } });
  }
  return _client;
}
