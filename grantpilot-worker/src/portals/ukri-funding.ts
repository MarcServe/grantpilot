/**
 * Portal recipe for UKRI Funding Service.
 *
 * UKRI runs a unified funding portal for Research Councils, Innovate UK, and Research England.
 * Flow:
 * 1. Opportunity listing on funding-service.ukri.org
 * 2. "Apply" redirects to login (may use UKRI or institution SSO)
 * 3. Multi-section application form
 */

import { registerPortal, type PortalRecipe } from "./registry.js";

const ukriFunding: PortalRecipe = {
  id: "ukri-funding",
  portalName: "UKRI Funding Service",
  hostPatterns: [
    "funding-service\\.ukri\\.org",
    "je-s\\.rcuk\\.ac\\.uk",
  ],
  loginUrl: "https://funding-service.ukri.org/login",
  loginSelectors: {
    username: 'input[name="email"], input[type="email"], input#email',
    password: 'input[name="password"], input[type="password"], input#password',
    submit: 'button[type="submit"]',
  },
  applicationUrlPattern: "funding-service\\.ukri\\.org/.*application",
  sections: [
    { id: "project_details", label: "Project details", profileFocus: "description, missionStatement" },
    { id: "applicants", label: "Applicants", profileFocus: "businessName, teamExpertise, employeeCount" },
    { id: "project_summary", label: "Project summary", profileFocus: "description, missionStatement, innovationCapabilities" },
    { id: "vision", label: "Vision", profileFocus: "innovationCapabilities, socialImpact, keyAchievements" },
    { id: "approach", label: "Approach", profileFocus: "innovationCapabilities, teamExpertise, sustainabilityInitiatives" },
    { id: "resources", label: "Resources and cost justification", profileFocus: "fundingMin, fundingMax, fundingDetails, annualRevenue" },
    { id: "ethics", label: "Ethics and responsible innovation", profileFocus: "socialImpact, communityEngagement, sustainabilityInitiatives" },
  ],
  navigationHints: {
    applyButtonText: "Apply|Start application|Begin application",
    nextButtonText: "Save and continue|Continue|Next",
    saveButtonText: "Save and return|Save",
    sectionNavSelector: "nav a, .application-nav a, [role='navigation'] a",
  },
  interstitialDismissSelectors: [
    'button:has-text("Accept")',
    'button:has-text("Accept cookies")',
  ],
};

registerPortal(ukriFunding);
