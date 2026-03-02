import { createHmac, timingSafeEqual } from "crypto";

const SECRET =
  process.env.START_APPLICATION_LINK_SECRET ??
  process.env.APPROVE_LINK_SECRET ??
  process.env.INNGEST_SIGNING_KEY ??
  "grantpilot-start-fallback";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface StartApplicationPayload {
  grantId: string;
  profileId: string;
  organisationId: string;
}

export function createStartApplicationToken(payload: StartApplicationPayload): string {
  const expiry = String(Date.now() + TTL_MS);
  const data = `${payload.grantId}:${payload.profileId}:${payload.organisationId}:${expiry}`;
  const sig = createHmac("sha256", SECRET).update(data).digest("base64url");
  return Buffer.from(`${data}:${sig}`).toString("base64url");
}

export function verifyStartApplicationToken(token: string): StartApplicationPayload | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 5) return null;
    const [grantId, profileId, organisationId, expiry, sig] = parts;
    if (!grantId || !profileId || !organisationId || !expiry || !sig) return null;
    if (Date.now() > Number(expiry)) return null;
    const data = `${grantId}:${profileId}:${organisationId}:${expiry}`;
    const expected = createHmac("sha256", SECRET).update(data).digest("base64url");
    if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig)))
      return null;
    return { grantId, profileId, organisationId };
  } catch {
    return null;
  }
}
