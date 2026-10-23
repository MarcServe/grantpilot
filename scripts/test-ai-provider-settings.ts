import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveAIProvider } from "../lib/ai-provider-settings";
const env = { OPENAI_API_KEY: "env-openai-fixture", ANTHROPIC_API_KEY: "env-claude-fixture", ENABLE_CLAUDE_GRANT_DISCOVERY: "false", GOOGLE_AI_API_KEY: "env-gemini-fixture" };
assert.equal(resolveAIProvider("openai", null, env).apiKey, "env-openai-fixture");
assert.equal(resolveAIProvider("openai", null, env).enabled, true);
const saved = resolveAIProvider("openai", { api_key: "saved-fixture", enabled: false }, env);
assert.equal(saved.apiKey, "saved-fixture");
assert.equal(saved.enabled, false);
assert.equal(saved.source, "admin");
assert.equal(resolveAIProvider("openai", { api_key: null, enabled: false }, env).apiKey, "env-openai-fixture", "Toggling discovery must preserve the environment key for core AI");
assert.equal(resolveAIProvider("claude", null, env).enabled, false);
assert.equal(resolveAIProvider("claude", { api_key: null, enabled: true }, env).enabled, true, "An explicit admin toggle overrides a disabled environment flag");
assert.equal(resolveAIProvider("gemini", null, env).apiKey, "env-gemini-fixture");
assert.equal(resolveAIProvider("apify", null, {}).apiKey, null);
assert.equal(resolveAIProvider("perplexity", null, {}).source, "none");
const migration = readFileSync("supabase/migrations/069_ai_provider_settings.sql", "utf8");
for (const name of ["ai_provider_read(text)", "ai_provider_save(text,text,boolean,text)", "ai_provider_reset(text)"]) {
  assert.ok(migration.includes(`revoke all on function public.${name} from public, anon, authenticated;`));
  assert.ok(migration.includes(`grant execute on function public.${name} to service_role;`));
}
assert.match(migration, /vault\.create_secret/);
assert.match(migration, /enable row level security/);
const route = readFileSync("app/api/admin/ai-providers/route.ts", "utf8");
assert.ok(route.indexOf("await isAdmin()") < route.indexOf("await getAIProviderStatuses()"));
assert.ok(!route.includes("console.log"), "Never log submitted keys");
console.log("Provider override, fallback, enablement and database access checks passed");
