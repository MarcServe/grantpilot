import { getCurrentUser } from "./auth";

const ADMIN_EMAIL = "michaelorji5111@gmail.com";

/**
 * True if the current user can access /admin. Uses ADMIN_EMAIL and optionally ADMIN_EMAILS (comma-separated).
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user?.email) return false;
  const email = user.email.trim().toLowerCase();
  if (email === ADMIN_EMAIL.toLowerCase()) return true;
  const fromEnv = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.includes(email);
}
