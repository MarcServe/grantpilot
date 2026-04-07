/**
 * Portal recipe for Innovate UK Innovation Funding Service (IFS).
 *
 * IFS uses a multi-section wizard with sidebar navigation. Typical flow:
 * 1. Competition page on Innovate UK marketing site
 * 2. "Apply" redirects to IFS login (apply-for-innovation-funding.service.gov.uk)
 * 3. After login, dashboard → create or continue application
 * 4. Wizard with ~10 sections (sidebar nav)
 */

import { registerPortal, type PortalRecipe } from "./registry.js";

const innovateUkIfs: PortalRecipe = {
  id: "innovate-uk-ifs",
  portalName: "Innovate UK IFS",
  hostPatterns: [
    "apply-for-innovation-funding\\.service\\.gov\\.uk",
    "ifs\\.innovateuk\\.org",
  ],
  loginUrl: "https://apply-for-innovation-funding.service.gov.uk/idp/login",
  loginSelectors: {
    username: 'input[name="j_username"], input#j_username, input[type="email"]',
    password: 'input[name="j_password"], input#j_password, input[type="password"]',
    submit: 'button[type="submit"], input[type="submit"]',
  },
  postLoginUrl: "https://apply-for-innovation-funding.service.gov.uk/applicant/dashboard",
  applicationUrlPattern: "apply-for-innovation-funding\\.service\\.gov\\.uk/application/\\d+",
  sections: [
    { id: "project_details", label: "Project details", profileFocus: "businessName, description, missionStatement, sector" },
    { id: "application_questions", label: "Application questions", profileFocus: "description, missionStatement, innovationCapabilities, socialImpact" },
    { id: "public_description", label: "Public description", profileFocus: "description, missionStatement" },
    { id: "scope", label: "Scope", profileFocus: "description, innovationCapabilities, teamExpertise" },
    { id: "business_case", label: "Business case / Market awareness", profileFocus: "annualRevenue, fundingDetails, keyAchievements, sector" },
    { id: "potential_market", label: "Potential market", profileFocus: "annualRevenue, sector, keyAchievements" },
    { id: "project_exploitation", label: "Project exploitation", profileFocus: "innovationCapabilities, sustainabilityInitiatives, fundingPurposes" },
    { id: "project_team", label: "Project team", profileFocus: "teamExpertise, employeeCount" },
    { id: "funding_details", label: "Funding details", profileFocus: "fundingMin, fundingMax, fundingPurposes, fundingDetails, annualRevenue" },
    { id: "finances", label: "Finances", profileFocus: "annualRevenue, fundingMin, fundingMax" },
  ],
  navigationHints: {
    applyButtonText: "Start new application|Continue application|Start application",
    nextButtonText: "Save and continue|Mark as complete",
    saveButtonText: "Save and return to application overview",
    sectionNavSelector: ".section-nav a, .task-list a, [class*='section'] a",
  },
  interstitialPatterns: [
    "terms-and-conditions",
    "cookie",
    "accept",
  ],
  interstitialDismissSelectors: [
    'button:has-text("Accept additional cookies")',
    'button:has-text("Reject additional cookies")',
    'button:has-text("Accept")',
    'button:has-text("I agree")',
    'a:has-text("Accept and continue")',
    "#cookie-accept",
    '[data-module="cookie-banner"] button',
  ],
};

registerPortal(innovateUkIfs);
