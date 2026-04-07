/**
 * Portal recipe registry — maps known grant portal hosts to navigation recipes
 * so the worker can handle multi-step, multi-portal application journeys.
 */

export interface PortalLoginSelectors {
  username: string;
  password: string;
  submit: string;
}

export interface PortalNavigationHints {
  applyButtonText?: string;
  nextButtonText?: string;
  saveButtonText?: string;
  sectionNavSelector?: string;
}

export interface PortalSection {
  id: string;
  label: string;
  /** Profile fields most relevant to this section (guides Claude prompt). */
  profileFocus: string;
}

export interface PortalRecipe {
  id: string;
  portalName: string;
  /** Regex patterns matching portal URLs (tested against full URL). */
  hostPatterns: string[];
  /** Direct login page URL if known. */
  loginUrl?: string;
  /** CSS selectors for the login form fields. */
  loginSelectors?: PortalLoginSelectors;
  /** URL to navigate to after successful login (e.g. dashboard or "start application"). */
  postLoginUrl?: string;
  /** Regex to detect when we've reached the actual application form/wizard. */
  applicationUrlPattern?: string;
  /** Ordered sections the portal's application wizard contains. */
  sections: PortalSection[];
  /** Portal-specific navigation hints for buttons/selectors. */
  navigationHints?: PortalNavigationHints;
  /** Extra URL patterns that indicate a "terms and conditions" or cookie interstitial. */
  interstitialPatterns?: string[];
  /** Selectors to click to dismiss interstitials (cookie consent, T&C accept). */
  interstitialDismissSelectors?: string[];
}

const recipes: PortalRecipe[] = [];

export function registerPortal(recipe: PortalRecipe): void {
  recipes.push(recipe);
}

/**
 * Look up a portal recipe by grant URL. Returns the first matching recipe or null.
 */
export function getPortalRecipe(url: string): PortalRecipe | null {
  for (const recipe of recipes) {
    for (const pattern of recipe.hostPatterns) {
      if (new RegExp(pattern, "i").test(url)) {
        return recipe;
      }
    }
  }
  return null;
}

/**
 * Get all registered portal recipes (for UI display / credential dropdowns).
 */
export function getAllPortalRecipes(): PortalRecipe[] {
  return [...recipes];
}

/** Serialisable subset of PortalRecipe safe to embed in session item extra_data. */
export interface PortalRecipeRef {
  id: string;
  portalName: string;
  loginUrl?: string;
  applicationUrlPattern?: string;
  sections: PortalSection[];
  navigationHints?: PortalNavigationHints;
  interstitialDismissSelectors?: string[];
}

export function toRecipeRef(recipe: PortalRecipe): PortalRecipeRef {
  return {
    id: recipe.id,
    portalName: recipe.portalName,
    loginUrl: recipe.loginUrl,
    applicationUrlPattern: recipe.applicationUrlPattern,
    sections: recipe.sections,
    navigationHints: recipe.navigationHints,
    interstitialDismissSelectors: recipe.interstitialDismissSelectors,
  };
}
