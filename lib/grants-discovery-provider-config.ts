const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

export const CLAUDE_DISCOVERY_KEY_ENV = ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"] as const;
export const GEMINI_DISCOVERY_KEY_ENV = ["GEMINI_API_KEY", "GOOGLE_AI_API_KEY"] as const;
export const CLAUDE_DISCOVERY_ENABLE_ENV = [
  "ENABLE_CLAUDE_GRANT_DISCOVERY",
  "CLAUDE_DISCOVERY_ENABLED",
] as const;
export const GEMINI_DISCOVERY_ENABLE_ENV = [
  "ENABLE_GEMINI_GRANT_DISCOVERY",
  "GEMINI_DISCOVERY_ENABLED",
] as const;

export function hasAnyEnv(names: readonly string[]): boolean {
  return names.some((name) => Boolean(process.env[name]?.trim()));
}

export function hasTruthyEnv(names: readonly string[]): boolean {
  return names.some((name) => TRUE_VALUES.has((process.env[name] ?? "").trim().toLowerCase()));
}

export function envNamesList(names: readonly string[]): string {
  return names.join(" or ");
}

export function isClaudeGrantDiscoveryEnabled(): boolean {
  return hasAnyEnv(CLAUDE_DISCOVERY_KEY_ENV) && hasTruthyEnv(CLAUDE_DISCOVERY_ENABLE_ENV);
}

export function isGeminiGrantDiscoveryEnabled(): boolean {
  return hasAnyEnv(GEMINI_DISCOVERY_KEY_ENV) && hasTruthyEnv(GEMINI_DISCOVERY_ENABLE_ENV);
}

export function isOptionalProviderQuotaOrBillingError(provider: string, message: string): boolean {
  if (provider !== "claude" && provider !== "gemini") return false;

  const normalized = message.toLowerCase();
  return (
    normalized.includes("credit balance is too low") ||
    normalized.includes("exceeded your current quota") ||
    normalized.includes("quota") ||
    normalized.includes("billing") ||
    normalized.includes("rate-limit") ||
    normalized.includes("rate limit")
  );
}
