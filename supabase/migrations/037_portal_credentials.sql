-- Portal credentials: encrypted login details for grant portals.
-- Passwords are AES-256-GCM encrypted using PORTAL_ENCRYPTION_KEY env var.

CREATE TABLE IF NOT EXISTS "PortalCredential" (
  "id" TEXT PRIMARY KEY DEFAULT generate_cuid(),
  "organisationId" TEXT NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "portalHost" TEXT NOT NULL,
  "portalName" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "encryptedPassword" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("organisationId", "portalHost")
);

COMMENT ON TABLE "PortalCredential" IS 'Encrypted login credentials for known grant portals (IFS, Find a Grant, UKRI, etc.)';
COMMENT ON COLUMN "PortalCredential"."encryptedPassword" IS 'AES-256-GCM encrypted, base64 encoded (iv:ciphertext:tag)';

-- RLS: only org members can see their own credentials
ALTER TABLE "PortalCredential" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_cred_org_access" ON "PortalCredential"
  USING ("organisationId" IN (
    SELECT "organisationId" FROM "OrganisationMember"
    WHERE "userId" = auth.uid()::text
  ));
