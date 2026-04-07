/**
 * Portal recipe for Arts Council England Grantium (Arts Culture Finance Online).
 *
 * Arts Council uses Grantium for their application portal.
 * Flow:
 * 1. Funding opportunity on artscouncil.org.uk
 * 2. "Apply" links to artsculturefinanceonline.org.uk (Grantium)
 * 3. Login → dashboard → application wizard with sections
 */

import { registerPortal, type PortalRecipe } from "./registry.js";

const artsCouncil: PortalRecipe = {
  id: "arts-council-grantium",
  portalName: "Arts Council England (Grantium)",
  hostPatterns: [
    "artsculturefinanceonline\\.org\\.uk",
    "grantium\\.com",
  ],
  loginUrl: "https://artsculturefinanceonline.org.uk/",
  loginSelectors: {
    username: 'input[name="username"], input[name="email"], input[type="email"], input#username',
    password: 'input[name="password"], input[type="password"], input#password',
    submit: 'button[type="submit"], input[type="submit"], button:has-text("Log in")',
  },
  applicationUrlPattern: "artsculturefinanceonline\\.org\\.uk.*application",
  sections: [
    { id: "contact_details", label: "Contact details", profileFocus: "businessName, location, registrationNumber" },
    { id: "project_details", label: "Tell us about your project", profileFocus: "description, missionStatement, socialImpact" },
    { id: "project_dates", label: "Project dates & location", profileFocus: "location" },
    { id: "budget", label: "Budget", profileFocus: "fundingMin, fundingMax, fundingDetails, annualRevenue" },
    { id: "outcomes", label: "Outcomes", profileFocus: "socialImpact, communityEngagement, keyAchievements" },
    { id: "supporting_documents", label: "Supporting documents", profileFocus: "documents" },
  ],
  navigationHints: {
    applyButtonText: "Apply|Start application|Create application",
    nextButtonText: "Save and continue|Next|Continue",
    saveButtonText: "Save draft|Save",
  },
  interstitialDismissSelectors: [
    'button:has-text("Accept")',
    'button:has-text("OK")',
  ],
};

registerPortal(artsCouncil);
