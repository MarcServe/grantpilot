/**
 * Portal recipe for Find a Grant (UK Government Grants).
 *
 * Find a Grant is the central UK government grants portal. Flow:
 * 1. Grant listing on find-government-grants.service.gov.uk
 * 2. "Start new application" or "Apply" button
 * 3. One Login (Gov.uk) authentication
 * 4. Multi-page application form
 */

import { registerPortal, type PortalRecipe } from "./registry.js";

const findAGrant: PortalRecipe = {
  id: "find-a-grant",
  portalName: "Find a Grant",
  hostPatterns: [
    "find-government-grants\\.service\\.gov\\.uk",
    "find-a-grant\\.service\\.gov\\.uk",
  ],
  loginUrl: "https://find-government-grants.service.gov.uk/apply/applicant",
  loginSelectors: {
    username: 'input[name="email"], input[type="email"], input#email',
    password: 'input[name="password"], input[type="password"], input#password',
    submit: 'button[type="submit"], input[type="submit"]',
  },
  applicationUrlPattern: "find-government-grants\\.service\\.gov\\.uk/apply/applicant/.*",
  sections: [
    { id: "eligibility", label: "Eligibility", profileFocus: "businessName, sector, location" },
    { id: "organisation_details", label: "Organisation details", profileFocus: "businessName, registrationNumber, location, sector, employeeCount" },
    { id: "funding", label: "Funding", profileFocus: "fundingMin, fundingMax, fundingPurposes, fundingDetails" },
    { id: "project_information", label: "Project information", profileFocus: "description, missionStatement, innovationCapabilities" },
    { id: "declarations", label: "Declarations", profileFocus: "businessName" },
  ],
  navigationHints: {
    applyButtonText: "Start new application|Apply|Start application",
    nextButtonText: "Save and continue|Continue",
    saveButtonText: "Save and come back later",
  },
  interstitialDismissSelectors: [
    'button:has-text("Accept analytics cookies")',
    'button:has-text("Accept")',
    "#cookie-banner-accept",
  ],
};

registerPortal(findAGrant);
