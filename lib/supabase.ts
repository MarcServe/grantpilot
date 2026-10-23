import { createClient } from "@supabase/supabase-js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export function getSupabaseAdmin(options?: { timeoutMs: number }) {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_KEY"),
    {
      auth: { persistSession: false },
      ...(options
        ? {
            global: {
              fetch: (input: RequestInfo | URL, init?: RequestInit) =>
                fetch(input, {
                  ...init,
                  signal: init?.signal
                    ? AbortSignal.any([
                        init.signal,
                        AbortSignal.timeout(options.timeoutMs),
                      ])
                    : AbortSignal.timeout(options.timeoutMs),
                }),
            },
          }
        : {}),
    },
  );
}
