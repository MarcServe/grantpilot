const FORMAT_ERROR = "The guidance was read, but its requirements could not be organised reliably. Please retry the source review. No new review was saved.";
export function sourceReviewErrorMessage(error: unknown): string {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  if (message.length > 500 || /^\s*[\[{]/.test(message) || /invalid_enum|invalid_type|Invalid enum|ZodError|Unexpected token|JSON/i.test(message)) return FORMAT_ERROR;
  if (/^(Source review|Source address|Source is|Funder |An accessible HTTPS|Add the official|Choose a business|Business profile or grant|Published source reviews|The published source|The guidance was read|Your eligibility check allowance)/.test(message)) return message;
  return "The source review could not be completed. Please retry. No new review was saved.";
}
