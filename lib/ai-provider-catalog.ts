export const AI_PROVIDERS = {
  openai: { label: "OpenAI", detail: "Trusted scoring, profile AI and grant discovery", keyEnv: ["OPENAI_API_KEY"], enableEnv: [] },
  perplexity: { label: "Perplexity", detail: "Web-grounded grant discovery", keyEnv: ["PERPLEXITY_API_KEY"], enableEnv: [] },
  claude: { label: "Claude", detail: "Optional web-search grant discovery", keyEnv: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"], enableEnv: ["ENABLE_CLAUDE_GRANT_DISCOVERY", "CLAUDE_DISCOVERY_ENABLED"] },
  gemini: { label: "Gemini", detail: "Optional grant discovery enrichment", keyEnv: ["GEMINI_API_KEY", "GOOGLE_AI_API_KEY"], enableEnv: ["ENABLE_GEMINI_GRANT_DISCOVERY", "GEMINI_DISCOVERY_ENABLED"] },
  apify: { label: "Apify", detail: "Daily grant-source discovery", keyEnv: ["APIFY_TOKEN"], enableEnv: [] },
} as const;
export type AIProvider = keyof typeof AI_PROVIDERS;
export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDERS) as AIProvider[];
