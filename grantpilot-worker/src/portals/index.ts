/**
 * Import all portal recipe files to register them with the registry.
 * This module should be imported once at worker startup.
 */

import "./innovate-uk.js";
import "./find-a-grant.js";
import "./ukri-funding.js";
import "./arts-council.js";

export {
  getPortalRecipe,
  getAllPortalRecipes,
  registerPortal,
  toRecipeRef,
  type PortalRecipe,
  type PortalRecipeRef,
  type PortalSection,
  type PortalLoginSelectors,
  type PortalNavigationHints,
} from "./registry.js";
