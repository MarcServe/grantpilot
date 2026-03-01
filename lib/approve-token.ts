import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.APPROVE_LINK_SECRET ?? process.env.INNGEST_SIGNING_KEY ?? "grantpilot-approve-fallback";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createApproveToken(applicationId: string): string {
  const expiry = String(Date.now() + TTL_MS);
  const payload = `${applicationId}:${expiry}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyApproveToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [applicationId, expiry, sig] = decoded.split(":");
    if (!applicationId || !expiry || !sig) return null;
    if (Date.now() > Number(expiry)) return null;
    const payload = `${applicationId}:${expiry}`;
    const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
    if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
    return applicationId;
  } catch {
    return null;
  }
}
