/**
 * Shared session-item generation for grant application pipelines.
 *
 * When a grant URL matches a known portal recipe, we generate portal-specific
 * steps (portal_navigate + fill_section per wizard section). Otherwise, we use
 * the generic agent pipeline, with user-facing steps that match the automation
 * loop shown in the application dashboard.
 */

export interface SessionItemDef {
  action: string;
  task_type: string;
  extra_data?: Record<string, unknown>;
}

interface PortalSectionLike {
  id: string;
  label: string;
  profileFocus: string;
}

interface PortalRecipeLike {
  id: string;
  portalName: string;
  loginUrl?: string;
  applicationUrlPattern?: string;
  sections: PortalSectionLike[];
  navigationHints?: Record<string, unknown>;
  interstitialDismissSelectors?: string[];
}

const TASK_TYPE = "grant_application";

const GENERIC_ITEMS: SessionItemDef[] = [
  { action: "open_grant_url", task_type: TASK_TYPE },
  { action: "detect_form_platform", task_type: TASK_TYPE },
  { action: "discover_entry_point", task_type: TASK_TYPE },
  { action: "enter_application_flow", task_type: TASK_TYPE },
  { action: "confirm_form_loaded", task_type: TASK_TYPE },
  { action: "extract_current_page_schema", task_type: TASK_TYPE },
  { action: "fill_current_page", task_type: TASK_TYPE },
  { action: "advance_form_page", task_type: TASK_TYPE },
  { action: "repeat_until_review", task_type: TASK_TYPE },
  { action: "prepare_review", task_type: TASK_TYPE },
];

// Final submission is only queued by /api/applications/submit after explicit user approval.

/**
 * Build session items for a grant application. If a portal recipe is provided,
 * uses portal-specific steps; otherwise falls back to the generic pipeline.
 */
export function buildSessionItems(opts: {
  autopilot?: boolean;
  portalRecipe?: PortalRecipeLike | null;
}): SessionItemDef[] {
  const { autopilot, portalRecipe } = opts;

  if (portalRecipe && portalRecipe.sections.length > 0) {
    const recipeRef = {
      id: portalRecipe.id,
      portalName: portalRecipe.portalName,
      loginUrl: portalRecipe.loginUrl,
      applicationUrlPattern: portalRecipe.applicationUrlPattern,
      sections: portalRecipe.sections,
      navigationHints: portalRecipe.navigationHints,
      interstitialDismissSelectors: portalRecipe.interstitialDismissSelectors,
    };

    const items: SessionItemDef[] = [
      { action: "open_grant_url", task_type: TASK_TYPE },
      {
        action: "portal_navigate",
        task_type: TASK_TYPE,
        extra_data: { portalRecipe: recipeRef },
      },
    ];

    for (const section of portalRecipe.sections) {
      items.push({
        action: `fill_section:${section.id}`,
        task_type: TASK_TYPE,
        extra_data: { portalRecipe: recipeRef, sectionId: section.id, sectionLabel: section.label },
      });
    }

    items.push({ action: "upload_documents", task_type: TASK_TYPE });
    items.push({ action: "prepare_review", task_type: TASK_TYPE });

    return items;
  }

  // Generic pipeline
  void autopilot;
  return [...GENERIC_ITEMS];
}

/**
 * Simple helper: try to match a URL against registered portal recipes.
 * This is a lightweight version that runs on the API side (no need to import
 * the full worker portal registry). It uses the same host-pattern logic.
 */
const KNOWN_PORTAL_RECIPES: PortalRecipeLike[] = [
  {
    id: "innovate-uk-ifs",
    portalName: "Innovate UK IFS",
    loginUrl: "https://apply-for-innovation-funding.service.gov.uk/idp/login",
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
    interstitialDismissSelectors: [
      'button:has-text("Accept additional cookies")',
      'button:has-text("Reject additional cookies")',
      'button:has-text("Accept")',
      'button:has-text("I agree")',
      'a:has-text("Accept and continue")',
      "#cookie-accept",
    ],
  },
  {
    id: "find-a-grant",
    portalName: "Find a Grant",
    loginUrl: "https://find-government-grants.service.gov.uk/apply/applicant",
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
    interstitialDismissSelectors: ['button:has-text("Accept analytics cookies")', 'button:has-text("Accept")', "#cookie-banner-accept"],
  },
  {
    id: "ukri-funding",
    portalName: "UKRI Funding Service",
    loginUrl: "https://funding-service.ukri.org/login",
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
    interstitialDismissSelectors: ['button:has-text("Accept")', 'button:has-text("Accept cookies")'],
  },
  {
    id: "arts-council-grantium",
    portalName: "Arts Council England (Grantium)",
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
    interstitialDismissSelectors: ['button:has-text("Accept")', 'button:has-text("OK")'],
  },
];

const HOST_PATTERNS: [RegExp, PortalRecipeLike][] = [
  [/apply-for-innovation-funding\.service\.gov\.uk/i, KNOWN_PORTAL_RECIPES[0]],
  [/ifs\.innovateuk\.org/i, KNOWN_PORTAL_RECIPES[0]],
  [/find-government-grants\.service\.gov\.uk/i, KNOWN_PORTAL_RECIPES[1]],
  [/find-a-grant\.service\.gov\.uk/i, KNOWN_PORTAL_RECIPES[1]],
  [/funding-service\.ukri\.org/i, KNOWN_PORTAL_RECIPES[2]],
  [/je-s\.rcuk\.ac\.uk/i, KNOWN_PORTAL_RECIPES[2]],
  [/artsculturefinanceonline\.org\.uk/i, KNOWN_PORTAL_RECIPES[3]],
  [/grantium\.com/i, KNOWN_PORTAL_RECIPES[3]],
];

export function matchPortalRecipe(url: string): PortalRecipeLike | null {
  for (const [pattern, recipe] of HOST_PATTERNS) {
    if (pattern.test(url)) return recipe;
  }
  return null;
}
