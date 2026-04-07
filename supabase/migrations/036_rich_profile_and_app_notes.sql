-- Rich profile sections for tailored grant application filling.
-- These give the AI specific material to emphasise per grant theme.
ALTER TABLE "BusinessProfile"
  ADD COLUMN IF NOT EXISTS "socialImpact" TEXT,
  ADD COLUMN IF NOT EXISTS "innovationCapabilities" TEXT,
  ADD COLUMN IF NOT EXISTS "sustainabilityInitiatives" TEXT,
  ADD COLUMN IF NOT EXISTS "communityEngagement" TEXT,
  ADD COLUMN IF NOT EXISTS "keyAchievements" TEXT,
  ADD COLUMN IF NOT EXISTS "teamExpertise" TEXT;

-- Per-application focus notes so users can guide the AI per grant.
ALTER TABLE "Application"
  ADD COLUMN IF NOT EXISTS "focusNotes" TEXT;

COMMENT ON COLUMN "BusinessProfile"."socialImpact" IS 'Social impact track record, beneficiaries, outcomes';
COMMENT ON COLUMN "BusinessProfile"."innovationCapabilities" IS 'Innovation approach, R&D, IP, tech capabilities';
COMMENT ON COLUMN "BusinessProfile"."sustainabilityInitiatives" IS 'Green/ESG initiatives, carbon reduction, circular economy';
COMMENT ON COLUMN "BusinessProfile"."communityEngagement" IS 'Community partnerships, local hiring, outreach, volunteering';
COMMENT ON COLUMN "BusinessProfile"."keyAchievements" IS 'Awards, milestones, growth metrics, notable contracts';
COMMENT ON COLUMN "BusinessProfile"."teamExpertise" IS 'Key team skills, qualifications, domain expertise';
COMMENT ON COLUMN "Application"."focusNotes" IS 'User-provided notes to guide AI: what to emphasise for this specific grant';
