import type { Page } from "playwright";
import type { CuSessionItem } from "./types.js";
import type { ProfileData, DocumentData } from "./profile-data.js";
import {
  navigateToGrantUrl,
  getFormFields,
  applyFillActions,
  applySnapshotValues,
  downloadToTemp,
  setFileInputs,
  clickSubmitButton,
  clickNextOrContinueButton,
  cleanupTempFiles,
  getFilledFormSnapshot,
  findAndClickApplyButton,
  filterApplicationFields,
  type FilledFormSnapshot,
  type FilledField,
} from "./browser.js";
import { getFormFillActionsWithMissing, getFileInputMapping, extractRequiredAttachmentsFromPage, type MissingRequiredField } from "./form-mapping.js";
import {
  matchDocumentsToRequirements,
  buildUploadPlan,
  type RequiredAttachment,
} from "./required-attachments.js";
import { detectPageSituation, quickPageCheck, analyzeFormFields, detectPortalPageSituation, type PageSituation } from "./page-situation.js";
import type { PortalRecipeRef } from "./portals/registry.js";
import { extractGrantFormSchema, schemaRequiresHumanReview } from "./form-schema.js";

export interface StepResult {
  success: boolean;
  notes: string;
  /** When true, step was skipped (e.g. no relevant fields on form). UI can show "Skipped". */
  skipped?: boolean;
  /** Filled form snapshot for in-app review (e.g. from prepare_review step). */
  snapshot?: FilledFormSnapshot;
  /** Page situation when open_grant_url hits login/list/verify; app shows banner. */
  situation?: PageSituation;
  /** When true, app should prompt user to set direct application URL. */
  needsDirectUrl?: boolean;
  /** When true, required form fields are missing from profile; app should collect and resume. */
  needsInput?: boolean;
  /** List of required fields to ask the user for (when needsInput is true). */
  missingRequired?: MissingRequiredField[];
  /** Number of fields/options the worker actually changed and verified. */
  filledCount?: number;
}

export interface GrantContext {
  name: string;
  funder: string;
  eligibility: string;
  description?: string;
  objectives?: string;
}

export interface GrantStepOptions {
  requiredAttachments?: RequiredAttachment[];
  /** User-edited snapshot fields; if present, submit uses these instead of re-mapping via Claude. */
  editedSnapshotFields?: FilledField[];
  /** User-provided answers for previously missing required fields (label -> value). */
  needsInputAnswers?: Record<string, string>;
  /** Grant context for vision-first, tone-aware filling (name, funder, eligibility, description). */
  grantContext?: GrantContext;
  /** User-provided notes guiding what to emphasise for this specific grant application. */
  focusNotes?: string;
  /** Portal recipe reference (if the grant URL matched a known portal). */
  portalRecipe?: PortalRecipeRef | null;
  /** Decrypted portal credentials for auto-login ({ username, password }). */
  portalCredentials?: { username: string; password: string } | null;
  /** Verified fill actions already applied earlier in this browser session. */
  priorFilledCount?: number;
  /** True only after explicit user approval. Autopilot/new sessions must not submit. */
  allowSubmit?: boolean;
}

async function getFileInputSelectors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="file"]');
    return Array.from(inputs).map((el) => {
      const name = (el as HTMLInputElement).name;
      const id = (el as HTMLInputElement).id;
      if (id) return `input#${CSS.escape(id)}`;
      if (name) return `input[name="${CSS.escape(name)}"]`;
      return "";
    }).filter(Boolean);
  });
}

/**
 * Run a pre-fill page situation check. Returns a StepResult if the page
 * is not suitable for filling (login, verification, 404, etc.), or null if OK.
 */
async function preFillPageCheck(page: Page, stepName: string): Promise<StepResult | null> {
  const situation = await quickPageCheck(page);
  if (situation === "login_required") {
    return {
      success: false,
      notes: `Page requires sign-in before ${stepName}. Sign in on the funder's site, then resume.`,
      situation: "login_required",
    };
  }
  if (situation === "needs_verification") {
    return {
      success: false,
      notes: `Page requires account verification before ${stepName}. Complete that on the funder's site, then resume.`,
      situation: "needs_verification",
    };
  }
  if (situation === "page_not_found") {
    return {
      success: false,
      notes: "Application link appears broken. Update the URL, then retry.",
      situation: "page_not_found",
      needsDirectUrl: true,
    };
  }
  return null;
}

const MAX_NAVIGATE_ATTEMPTS = 3;

export async function runGrantStep(
  page: Page,
  item: CuSessionItem,
  profile: ProfileData,
  documents: DocumentData[],
  options?: GrantStepOptions
): Promise<StepResult> {
  const action = (item.action ?? "").toLowerCase();
  const grantUrl = item.grant_url ?? "";
  const requiredAttachments = options?.requiredAttachments ?? [];

  switch (action) {
    case "open_grant_url": {
      if (!grantUrl) {
        return { success: false, notes: "No grant URL on item" };
      }
      const nav = await navigateToGrantUrl(page, grantUrl);
      if (!nav.ok) {
        if (nav.status === 404 || nav.status === 410) {
          return {
            success: false,
            notes: "This application link is broken (404 / page not found). Please find the correct application URL and update it for this grant, then retry.",
            situation: "page_not_found",
            needsDirectUrl: true,
          };
        }
        return { success: false, notes: nav.error ?? "Navigate failed" };
      }

      // IFS competition overview pages always contain "sign in" in the copy — vision/heuristics
      // misclassify as login_required. The next step (portal_navigate) dismisses cookies,
      // signs in with saved credentials, and clicks "Start new application".
      const finalUrl = (nav.finalUrl ?? page.url() ?? grantUrl).toLowerCase();
      if (
        /apply-for-innovation-funding\.service\.gov\.uk\/competition\/\d+\/overview\//i.test(finalUrl) ||
        /apply-for-innovation-funding\.service\.gov\.uk\/competition\/\d+\/overview\//i.test(grantUrl.toLowerCase())
      ) {
        return {
          success: true,
          notes: `Opened Innovate UK competition overview; portal_navigate will sign in or start application.`,
        };
      }

      const { situation, needsDirectUrl } = await detectPageSituation(page, {
        status: nav.status,
        finalUrl: nav.finalUrl,
      });
      if (situation === "login_required") {
        return {
          success: false,
          notes: "This funder requires you to sign in. Sign in on their site, then use the bookmarklet or Resume to continue.",
          situation: "login_required",
        };
      }
      if (situation === "needs_verification") {
        return {
          success: false,
          notes: "This funder requires you to create an account or verify your email. Complete that on the funder's site, then use the bookmarklet or Resume to continue.",
          situation: "needs_verification",
        };
      }
      if (situation === "competition_list") {
        return {
          success: false,
          notes: "This link goes to a list of schemes. Please open the specific grant and update the application URL for this grant, then retry.",
          situation: "competition_list",
          needsDirectUrl: needsDirectUrl ?? true,
        };
      }
      if (situation === "page_not_found") {
        return {
          success: false,
          notes: "This application link is broken (404 / page not found). Please find the correct application URL and update it for this grant, then retry.",
          situation: "page_not_found",
          needsDirectUrl: needsDirectUrl ?? true,
        };
      }
      // info_page_with_apply and application_form both continue — navigate_to_form handles the rest
      // unknown also passes through to let navigate_to_form attempt detection
      return { success: true, notes: `Opened ${grantUrl} (page: ${situation})` };
    }

    case "navigate_to_form": {
      // This step ensures we're on an actual application form before filling begins.
      // It handles: info pages with Apply buttons, multi-click navigation, login gates.
      let attempts = 0;

      while (attempts < MAX_NAVIGATE_ATTEMPTS) {
        const result = await detectPageSituation(page);
        console.log(`[navigate_to_form] attempt ${attempts + 1}: situation=${result.situation}`);

        if (result.situation === "application_form") {
          // Verify this really has substantive application fields
          const fieldAnalysis = await analyzeFormFields(page);
          if (fieldAnalysis.applicationFieldCount >= 3) {
            return {
              success: true,
              notes: `On application form (${fieldAnalysis.applicationFieldCount} fields, ${fieldAnalysis.chromeFieldCount} chrome fields filtered)`,
            };
          }
          // Few real fields — might be a false positive, but proceed cautiously
          if (fieldAnalysis.applicationFieldCount >= 1) {
            return {
              success: true,
              notes: `On form with ${fieldAnalysis.applicationFieldCount} application field(s) — may be a wizard with more steps`,
            };
          }
          // Zero application fields despite being classified as form — this is a false positive
          return {
            success: false,
            notes: "Page was classified as a form but has no application fields (only search/filter/navigation inputs). Please provide a direct link to the application form.",
            situation: "unknown",
            needsDirectUrl: true,
          };
        }

        if (result.situation === "info_page_with_apply") {
          const { clicked, error } = await findAndClickApplyButton(page, result.applyButtonSelector);
          if (clicked) {
            await page.waitForTimeout(3000);
            attempts++;
            continue; // re-check after clicking
          }
          return {
            success: false,
            notes: `Found info page but could not click Apply button: ${error ?? "unknown"}. Please navigate to the form manually and provide the direct application URL.`,
            situation: "unknown",
            needsDirectUrl: true,
          };
        }

        if (result.situation === "login_required") {
          return {
            success: false,
            notes: "This grant requires you to sign in before accessing the application form. Sign in on the funder's site, then resume.",
            situation: "login_required",
          };
        }

        if (result.situation === "needs_verification") {
          return {
            success: false,
            notes: "This grant requires account creation or email verification. Complete that on the funder's site, then resume.",
            situation: "needs_verification",
          };
        }

        if (result.situation === "competition_list") {
          return {
            success: false,
            notes: "This link goes to a list of grants, not a specific application form. Please provide the direct application URL.",
            situation: "competition_list",
            needsDirectUrl: true,
          };
        }

        if (result.situation === "page_not_found") {
          return {
            success: false,
            notes: "This application link is broken. Please update the URL, then retry.",
            situation: "page_not_found",
            needsDirectUrl: true,
          };
        }

        // unknown — try to find an Apply button anyway
        const { clicked } = await findAndClickApplyButton(page);
        if (clicked) {
          await page.waitForTimeout(3000);
          attempts++;
          continue;
        }

        return {
          success: false,
          notes: "Could not find an application form or Apply button on this page. Please provide a direct link to the application form.",
          situation: "unknown",
          needsDirectUrl: true,
        };
      }

      return {
        success: false,
        notes: `Navigated ${MAX_NAVIGATE_ATTEMPTS} times but could not reach an application form. The link may require manual navigation.`,
        situation: "unknown",
        needsDirectUrl: true,
      };
    }

    case "fill_company_details": {
      // Pre-fill page check
      const pageCheck = await preFillPageCheck(page, "filling company details");
      if (pageCheck) return pageCheck;

      const maxWizardSteps = 10;
      let totalApplied = 0;
      const allErrors: string[] = [];
      for (let step = 0; step < maxWizardSteps; step++) {
        const rawFields = await getFormFields(page);
        const fields = await filterApplicationFields(rawFields);

        if (fields.length === 0 && rawFields.length > 0) {
          console.log(`[fill_company] Step ${step}: ${rawFields.length} fields on page but all filtered as site chrome`);
        }

        const fillOptions = options?.grantContext ? { page, grantContext: options.grantContext, focusNotes: options?.focusNotes } : undefined;
        const { actions, missingRequired } = await getFormFillActionsWithMissing(
          fields,
          profile,
          "company",
          options?.needsInputAnswers,
          fillOptions
        );
        if (missingRequired.length > 0) {
          return {
            success: false,
            notes: "Some required fields are missing from your profile. We've sent you a link to provide them, then you can resume.",
            needsInput: true,
            missingRequired,
          };
        }
        if (actions.length > 0) {
          const { applied, errors } = await applyFillActions(page, actions);
          totalApplied += applied;
          allErrors.push(...errors);

          // Re-check page situation after filling (catch login redirects)
          const postFillCheck = await quickPageCheck(page);
          if (postFillCheck === "login_required") {
            return {
              success: false,
              notes: "Page redirected to sign-in after filling. Sign in on the funder's site, then resume.",
              situation: "login_required",
            };
          }
          if (postFillCheck === "needs_verification") {
            return {
              success: false,
              notes: "Page requires account or email verification. Complete that on the funder's site, then resume.",
              situation: "needs_verification",
            };
          }
        }
        const clickedNext = await clickNextOrContinueButton(page);
        if (!clickedNext) break;
        await page.waitForTimeout(2000);

        // Re-check after page transition
        const transitionCheck = await quickPageCheck(page);
        if (transitionCheck === "login_required") {
          return {
            success: false,
            notes: "Page redirected to sign-in after wizard step. Sign in and resume.",
            situation: "login_required",
          };
        }
      }
      if (totalApplied === 0) {
        return { success: true, skipped: true, notes: "No company fields on form; skipped" };
      }
      const note =
        allErrors.length > 0
          ? `Filled ${totalApplied} fields; errors: ${allErrors.join("; ")}`
          : `Filled ${totalApplied} company fields`;
      return { success: totalApplied > 0, notes: note, filledCount: totalApplied };
    }

    case "fill_financials": {
      // Pre-fill page check
      const pageCheck = await preFillPageCheck(page, "filling financial details");
      if (pageCheck) return pageCheck;

      const maxWizardSteps = 10;
      let totalApplied = 0;
      const allErrors: string[] = [];
      for (let step = 0; step < maxWizardSteps; step++) {
        const rawFields = await getFormFields(page);
        const fields = await filterApplicationFields(rawFields);

        const fillOptions = options?.grantContext ? { page, grantContext: options.grantContext, focusNotes: options?.focusNotes } : undefined;
        const { actions, missingRequired } = await getFormFillActionsWithMissing(
          fields,
          profile,
          "financial",
          options?.needsInputAnswers,
          fillOptions
        );
        if (missingRequired.length > 0) {
          return {
            success: false,
            notes: "Some required financial fields are missing from your profile. Provide them in the link we sent, then resume.",
            needsInput: true,
            missingRequired,
          };
        }
        if (actions.length > 0) {
          const { applied, errors } = await applyFillActions(page, actions);
          totalApplied += applied;
          allErrors.push(...errors);
        }
        const clickedNext = await clickNextOrContinueButton(page);
        if (!clickedNext) break;
        await page.waitForTimeout(2000);

        // Re-check after page transition
        const transitionCheck = await quickPageCheck(page);
        if (transitionCheck === "login_required") {
          return {
            success: false,
            notes: "Page redirected to sign-in. Sign in and resume.",
            situation: "login_required",
          };
        }
      }
      if (totalApplied === 0) {
        return { success: true, skipped: true, notes: "No financial fields on form; skipped" };
      }
      const note =
        allErrors.length > 0
          ? `Filled ${totalApplied} fields; errors: ${allErrors.join("; ")}`
          : `Filled ${totalApplied} financial fields`;
      return { success: totalApplied > 0, notes: note, filledCount: totalApplied };
    }

    case "upload_documents": {
      // Pre-fill page check
      const pageCheck = await preFillPageCheck(page, "uploading documents");
      if (pageCheck) return pageCheck;

      const selectors = await getFileInputSelectors(page);
      if (selectors.length === 0) {
        return { success: true, skipped: true, notes: "No file inputs on form; skipped" };
      }
      if (documents.length === 0) {
        return { success: true, skipped: true, notes: "No documents in profile; skipped" };
      }
      const tempPaths: string[] = [];
      try {
        let orderedSelectors: string[];
        let paths: string[];

        const attachmentsToUse =
          requiredAttachments.length > 0
            ? requiredAttachments
            : await extractRequiredAttachmentsFromPage(page);

        if (attachmentsToUse.length > 0) {
          const matched = matchDocumentsToRequirements(attachmentsToUse, documents);
          const plan = buildUploadPlan(selectors, documents, matched);
          orderedSelectors = plan.selectors;
          paths = [];
          for (const url of plan.documentUrls) {
            const p = await downloadToTemp(url);
            tempPaths.push(p);
            paths.push(p);
          }
          if (plan.missing.length > 0) {
            await page.evaluate(() => {}); // no-op
          }
          const { set, errors } = await setFileInputs(page, orderedSelectors, paths);
          cleanupTempFiles(tempPaths);
          const missingNote =
            plan.missing.length > 0 ? ` Missing: ${plan.missing.join(", ")}.` : "";
          const note =
            errors.length > 0
              ? `Uploaded ${set} file(s); errors: ${errors.join("; ")}.${missingNote}`
              : `Uploaded ${set} document(s).${missingNote}`;
          return { success: set > 0, notes: note.trim() };
        }

        const mapping = await getFileInputMapping(
          selectors,
          documents.map((d) => d.name),
          { page }
        );
        for (let i = 0; i < documents.length; i++) {
          const path = await downloadToTemp(documents[i].url);
          tempPaths.push(path);
        }
        const pathArr = tempPaths;
        orderedSelectors = mapping.map((m) => m.selector);
        paths = mapping.map((m) => pathArr[m.documentIndex] ?? pathArr[0]);
        const { set, errors } = await setFileInputs(page, orderedSelectors, paths);
        cleanupTempFiles(tempPaths);
        const note =
          errors.length > 0
            ? `Uploaded ${set} file(s); errors: ${errors.join("; ")}`
            : `Uploaded ${set} document(s)`;
        return { success: set > 0 || documents.length === 0, notes: note };
      } catch (e) {
        cleanupTempFiles(tempPaths);
        const msg = e instanceof Error ? e.message : String(e);
        return { success: false, notes: `Upload failed: ${msg}` };
      }
    }

    case "prepare_review": {
      if ((options?.priorFilledCount ?? 0) <= 0) {
        return {
          success: false,
          notes: "No fields were successfully filled by the automation, so there is nothing ready for review. Please update the profile/application answers or provide a more direct form URL.",
          situation: "unknown",
          needsDirectUrl: true,
        };
      }

      // Pre-review validation: verify we actually filled substantive form fields
      const fieldAnalysis = await analyzeFormFields(page);
      if (fieldAnalysis.applicationFieldCount === 0) {
        const detail = fieldAnalysis.totalFields > 0
          ? `Page has ${fieldAnalysis.totalFields} inputs but none are application fields (all are search/filter/navigation).`
          : "Page has no form inputs at all.";
        return {
          success: false,
          notes: `${detail} This does not appear to be a grant application form. Please provide a direct application URL.`,
          situation: "unknown",
          needsDirectUrl: true,
        };
      }

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const snapshot = await getFilledFormSnapshot(page);
      const formSchema = await extractGrantFormSchema(page, options?.grantContext);
      snapshot.formSchema = formSchema;
      snapshot.automationRisks = formSchema.automation_risks ?? [];
      snapshot.humanReviewRequired = schemaRequiresHumanReview(formSchema);

      // Check that the snapshot has meaningful filled values
      const filledFields = snapshot.fields.filter((f) => f.value && f.value.trim().length > 0);
      if (filledFields.length === 0) {
        return {
          success: false,
          notes: "No fields were filled on this page. The application form may require login or a different URL.",
          situation: "unknown",
          needsDirectUrl: true,
        };
      }

      return {
        success: true,
        notes: `Form ready for review (${filledFields.length} fields filled)`,
        snapshot,
      };
    }

    case "submit_application": {
      if (!options?.allowSubmit) {
        return {
          success: false,
          notes: "Final submission is blocked until the user explicitly reviews and approves the filled application.",
          needsInput: true,
        };
      }
      // Pre-fill page check
      const pageCheck = await preFillPageCheck(page, "submitting");
      if (pageCheck) return pageCheck;

      if (grantUrl) {
        const { ok, error: navErr } = await navigateToGrantUrl(page, grantUrl);
        if (!ok) return { success: false, notes: navErr ?? "Navigate failed" };
      }

      const submitSchema = await extractGrantFormSchema(page, options?.grantContext);
      const blockingRisks = (submitSchema.automation_risks ?? []).filter((risk) => /captcha|otp|login/i.test(risk));
      if (blockingRisks.length > 0) {
        return {
          success: false,
          notes: `Final submission is blocked because the form requires human intervention: ${blockingRisks.join(", ")}.`,
        };
      }

      const editedFields = options?.editedSnapshotFields;
      if (editedFields && editedFields.length > 0) {
        await applySnapshotValues(page, editedFields);
      } else {
        const rawFields = await getFormFields(page);
        const fields = await filterApplicationFields(rawFields);
        const fillOptions = options?.grantContext ? { page, grantContext: options.grantContext, focusNotes: options?.focusNotes } : undefined;
        const { actions: companyActions } = await getFormFillActionsWithMissing(
          fields,
          profile,
          "company",
          options?.needsInputAnswers,
          fillOptions
        );
        const { actions: financialActions } = await getFormFillActionsWithMissing(
          fields,
          profile,
          "financial",
          options?.needsInputAnswers,
          fillOptions
        );
        await applyFillActions(page, companyActions);
        await applyFillActions(page, financialActions);
      }
      if (documents.length > 0) {
        const selectors = await getFileInputSelectors(page);
        if (selectors.length > 0) {
          const tempPaths: string[] = [];
          try {
            let orderedSelectors: string[];
            let paths: string[];
            const attachmentsToUse =
              requiredAttachments.length > 0
                ? requiredAttachments
                : await extractRequiredAttachmentsFromPage(page);
            if (attachmentsToUse.length > 0) {
              const matched = matchDocumentsToRequirements(attachmentsToUse, documents);
              const plan = buildUploadPlan(selectors, documents, matched);
              for (const url of plan.documentUrls) {
                const p = await downloadToTemp(url);
                tempPaths.push(p);
              }
              orderedSelectors = plan.selectors;
              paths = tempPaths;
            } else {
              const pathsAll = await Promise.all(documents.map((d) => downloadToTemp(d.url)));
              tempPaths.push(...pathsAll);
              const mapping = await getFileInputMapping(
                selectors,
                documents.map((d) => d.name),
                { page }
              );
              orderedSelectors = mapping.map((m) => m.selector);
              paths = mapping.map((m) => pathsAll[m.documentIndex] ?? pathsAll[0]);
            }
            await setFileInputs(page, orderedSelectors, paths);
          } finally {
            cleanupTempFiles(tempPaths);
          }
        }
      }
      const { clicked, error } = await clickSubmitButton(page);
      if (clicked) {
        await page.waitForTimeout(2000);
        return { success: true, notes: "Form filled and submit button clicked" };
      }
      return { success: false, notes: error ?? "Could not find or click submit" };
    }

    default: {
      // Handle fill_section:<sectionId> dynamic actions
      if (action.startsWith("fill_section:")) {
        return runFillSection(page, item, profile, documents, options);
      }
      if (action === "portal_navigate") {
        return runPortalNavigate(page, item, profile, options);
      }
      return {
        success: false,
        notes: `Unknown action: ${action}`,
      };
    }
  }
}

/* ──────────────────────────────────────────────────────────────────────
 *  portal_navigate step
 *  Follows portal recipe: dismiss interstitials → detect login →
 *  auto-login (if creds) → navigate to application form.
 * ──────────────────────────────────────────────────────────────────── */
const MAX_PORTAL_NAV_ATTEMPTS = 6;

async function runPortalNavigate(
  page: Page,
  item: CuSessionItem,
  _profile: ProfileData,
  options?: GrantStepOptions
): Promise<StepResult> {
  const recipe = options?.portalRecipe ??
    (item.extra_data as Record<string, unknown> | null)?.portalRecipe as PortalRecipeRef | undefined;

  if (!recipe) {
    return { success: false, notes: "portal_navigate called but no portal recipe available — falling back." };
  }

  // Step 1: dismiss interstitials (cookie banners, T&C pages)
  if (recipe.interstitialDismissSelectors?.length) {
    for (const sel of recipe.interstitialDismissSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click().catch(() => {});
          await page.waitForTimeout(1000);
        }
      } catch { /* ignore */ }
    }
  }

  // Step 2: check if we're already on the application form
  if (recipe.applicationUrlPattern) {
    const currentUrl = page.url();
    if (new RegExp(recipe.applicationUrlPattern, "i").test(currentUrl)) {
      return { success: true, notes: `Already on ${recipe.portalName} application form.` };
    }
  }

  // Step 3: detect page situation (portal-aware first, then generic)
  for (let attempt = 0; attempt < MAX_PORTAL_NAV_ATTEMPTS; attempt++) {
    const currentUrl = page.url();
    console.log(`[portal_navigate] attempt ${attempt + 1}: url=${currentUrl}`);

    // Check if we've arrived at the application form
    if (recipe.applicationUrlPattern && new RegExp(recipe.applicationUrlPattern, "i").test(currentUrl)) {
      return { success: true, notes: `Navigated to ${recipe.portalName} application form.` };
    }

    // Use portal-specific detection first (fast, no API calls)
    const portalResult = await detectPortalPageSituation(page, recipe.id);
    const result = portalResult ?? await detectPageSituation(page);

    // Portal dashboard — look for "Start/Continue application" button
    if (result.situation === "portal_dashboard") {
      const applyText = recipe.navigationHints?.applyButtonText;
      let clicked = false;
      if (applyText) {
        for (const text of applyText.split("|")) {
          try {
            const btn = page.locator(`a:has-text("${text.trim()}"), button:has-text("${text.trim()}")`).first();
            if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await btn.click();
              await page.waitForTimeout(3000);
              clicked = true;
              break;
            }
          } catch { /* try next pattern */ }
        }
      }
      if (clicked) continue;
      // Fall through to generic Apply button search
    }

    // Portal section list — we're on the application overview, ready for fill_section steps
    if (result.situation === "portal_section_list") {
      return { success: true, notes: `On ${recipe.portalName} application section overview.` };
    }

    // Portal terms / interstitials — try to dismiss
    if (result.situation === "portal_terms") {
      if (recipe.interstitialDismissSelectors?.length) {
        for (const sel of recipe.interstitialDismissSelectors) {
          try {
            const el = await page.$(sel);
            if (el) { await el.click().catch(() => {}); await page.waitForTimeout(2000); }
          } catch { /* ignore */ }
        }
        continue;
      }
    }

    // Login page detected
    if (result.situation === "login_required") {
      const creds = options?.portalCredentials;
      if (!creds) {
        return {
          success: false,
          notes: `${recipe.portalName} requires login. Save your portal credentials in Settings → Portal Credentials, then retry.`,
          situation: "login_required",
          needsInput: true,
        };
      }

      // Auto-login with stored credentials
      const loginOk = await attemptPortalLogin(page, recipe, creds);
      if (!loginOk) {
        return {
          success: false,
          notes: `Auto-login to ${recipe.portalName} failed. Check your portal credentials and try again.`,
          situation: "login_required",
        };
      }
      await page.waitForTimeout(3000);
      continue; // re-check after login
    }

    // Info / marketing page — try to click Apply
    if (result.situation === "info_page_with_apply" || result.situation === "unknown") {
      const applyText = recipe.navigationHints?.applyButtonText;
      let clicked = false;

      // Try portal-specific apply button text patterns
      if (applyText) {
        for (const text of applyText.split("|")) {
          try {
            const btn = page.locator(`a:has-text("${text.trim()}"), button:has-text("${text.trim()}")`).first();
            if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await btn.click();
              await Promise.race([
                page.waitForLoadState("domcontentloaded").catch(() => {}),
                page.waitForTimeout(5000),
              ]);
              clicked = true;
              break;
            }
          } catch { /* try next pattern */ }
        }
      }

      if (!clicked) {
        const { clicked: fallbackClicked } = await findAndClickApplyButton(page, result.applyButtonSelector);
        clicked = fallbackClicked;
      }

      if (clicked) {
        await page.waitForTimeout(3000);
        continue;
      }

      if (attempt >= 2) {
        return {
          success: false,
          notes: `Could not navigate to the application form on ${recipe.portalName} after ${attempt + 1} attempts. Please provide a direct application URL.`,
          situation: "unknown",
          needsDirectUrl: true,
        };
      }
    }

    if (result.situation === "application_form") {
      return { success: true, notes: `On ${recipe.portalName} application form.` };
    }

    if (result.situation === "page_not_found") {
      return {
        success: false,
        notes: "Application link is broken. Update the URL and retry.",
        situation: "page_not_found",
        needsDirectUrl: true,
      };
    }

    if (result.situation === "competition_list") {
      return {
        success: false,
        notes: `This link goes to a list of competitions on ${recipe.portalName}. Please select the specific grant and provide its URL.`,
        situation: "competition_list",
        needsDirectUrl: true,
      };
    }

    if (result.situation === "needs_verification") {
      return {
        success: false,
        notes: `${recipe.portalName} requires account verification. Complete verification on the portal site, then retry.`,
        situation: "needs_verification",
      };
    }
  }

  return {
    success: false,
    notes: `Could not reach the application form on ${recipe.portalName} after ${MAX_PORTAL_NAV_ATTEMPTS} attempts.`,
    situation: "unknown",
    needsDirectUrl: true,
  };
}

/**
 * Attempt to fill the login form using portal recipe selectors and stored credentials.
 * Returns true if the form was submitted (doesn't guarantee login succeeded — caller re-checks).
 */
async function attemptPortalLogin(
  page: Page,
  recipe: PortalRecipeRef,
  creds: { username: string; password: string }
): Promise<boolean> {
  // If recipe has a loginUrl and we're not on it, go there
  if (recipe.loginUrl) {
    const currentUrl = page.url();
    if (!currentUrl.includes(new URL(recipe.loginUrl).hostname)) {
      try {
        await page.goto(recipe.loginUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForTimeout(2000);
      } catch {
        // We may already be on a login page at a different path
      }
    }
  }

  // Try username field
  const usernameSelectors = [
    'input[name="j_username"]', 'input#j_username',
    'input[name="username"]', 'input#username',
    'input[name="email"]', 'input#email',
    'input[type="email"]',
  ];
  let usernameEl = null;
  for (const sel of usernameSelectors) {
    usernameEl = await page.$(sel);
    if (usernameEl) break;
  }
  if (!usernameEl) return false;

  // Try password field
  const passwordSelectors = [
    'input[name="j_password"]', 'input#j_password',
    'input[name="password"]', 'input#password',
    'input[type="password"]',
  ];
  let passwordEl = null;
  for (const sel of passwordSelectors) {
    passwordEl = await page.$(sel);
    if (passwordEl) break;
  }
  if (!passwordEl) return false;

  // Fill credentials
  await usernameEl.fill(creds.username);
  await passwordEl.fill(creds.password);

  // Click submit
  const submitSelectors = ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Sign in")', 'button:has-text("Log in")'];
  for (const sel of submitSelectors) {
    const btn = await page.$(sel);
    if (btn) {
      await btn.click();
      await Promise.race([
        page.waitForLoadState("domcontentloaded").catch(() => {}),
        page.waitForTimeout(8000),
      ]);
      return true;
    }
  }
  return false;
}

/* ──────────────────────────────────────────────────────────────────────
 *  fill_section:<sectionId> step
 *  Navigates to a specific section in a portal wizard, then fills it
 *  using section-aware Claude prompts.
 * ──────────────────────────────────────────────────────────────────── */

async function runFillSection(
  page: Page,
  item: CuSessionItem,
  profile: ProfileData,
  _documents: DocumentData[],
  options?: GrantStepOptions
): Promise<StepResult> {
  const actionStr = (item.action ?? "").toLowerCase();
  const sectionId = actionStr.replace("fill_section:", "");
  const recipe = options?.portalRecipe ??
    (item.extra_data as Record<string, unknown> | null)?.portalRecipe as PortalRecipeRef | undefined;

  const sectionDef = recipe?.sections?.find((s) => s.id === sectionId);
  const sectionLabel = sectionDef?.label ?? sectionId.replace(/_/g, " ");

  // Pre-fill page check
  const pageCheck = await preFillPageCheck(page, `filling ${sectionLabel}`);
  if (pageCheck) return pageCheck;

  // Try to navigate to the section via sidebar/tab navigation
  const navClicked = await navigateToSection(page, sectionId, sectionLabel, recipe);
  if (navClicked) {
    await page.waitForTimeout(2000);
  }

  const maxWizardSteps = 10;
  let totalApplied = 0;
  const allErrors: string[] = [];

  for (let step = 0; step < maxWizardSteps; step++) {
    const rawFields = await getFormFields(page);
    const fields = await filterApplicationFields(rawFields);

    if (fields.length === 0 && step === 0 && rawFields.length === 0) {
      return { success: true, skipped: true, notes: `No fields found in section "${sectionLabel}"; skipped` };
    }

    // Use section-aware filling: pass sectionName to form-mapping
    const fillOptions = options?.grantContext ? {
      page,
      grantContext: options.grantContext,
      focusNotes: options?.focusNotes,
      sectionName: sectionId,
      sectionProfileFocus: sectionDef?.profileFocus,
    } : undefined;

    const { actions, missingRequired } = await getFormFillActionsWithMissing(
      fields,
      profile,
      deriveFillKind(sectionId),
      options?.needsInputAnswers,
      fillOptions as import("./form-mapping.js").FormFillOptions | undefined
    );

    if (missingRequired.length > 0) {
      return {
        success: false,
        notes: `Some required fields are missing for section "${sectionLabel}". Provide them via the link we sent, then resume.`,
        needsInput: true,
        missingRequired,
      };
    }

    if (actions.length > 0) {
      const { applied, errors } = await applyFillActions(page, actions);
      totalApplied += applied;
      allErrors.push(...errors);

      const postFillCheck = await quickPageCheck(page);
      if (postFillCheck === "login_required") {
        return { success: false, notes: "Redirected to sign-in after filling. Sign in and resume.", situation: "login_required" };
      }
    }

    // Try section-specific save button first
    if (recipe?.navigationHints?.saveButtonText) {
      const saved = await clickButtonByText(page, recipe.navigationHints.saveButtonText);
      if (saved) {
        await page.waitForTimeout(2000);
      }
    }

    // Try next/continue within the section
    let clickedNext = false;
    if (recipe?.navigationHints?.nextButtonText) {
      clickedNext = await clickButtonByText(page, recipe.navigationHints.nextButtonText);
    }
    if (!clickedNext) {
      clickedNext = await clickNextOrContinueButton(page);
    }
    if (!clickedNext) break;
    await page.waitForTimeout(2000);

    const transitionCheck = await quickPageCheck(page);
    if (transitionCheck === "login_required") {
      return { success: false, notes: "Redirected to sign-in after wizard step. Sign in and resume.", situation: "login_required" };
    }
  }

  if (totalApplied === 0) {
    return { success: true, skipped: true, notes: `No fillable fields in section "${sectionLabel}"; skipped` };
  }

  const note = allErrors.length > 0
    ? `Filled ${totalApplied} fields in "${sectionLabel}"; errors: ${allErrors.join("; ")}`
    : `Filled ${totalApplied} fields in "${sectionLabel}"`;
  return { success: totalApplied > 0, notes: note, filledCount: totalApplied };
}

/**
 * Try to navigate to a section via sidebar nav or tab links.
 */
async function navigateToSection(
  page: Page,
  sectionId: string,
  sectionLabel: string,
  recipe?: PortalRecipeRef | null
): Promise<boolean> {
  // 1. Try portal-specific nav selector
  if (recipe?.navigationHints?.sectionNavSelector) {
    try {
      const navLink = page.locator(recipe.navigationHints.sectionNavSelector, {
        hasText: new RegExp(sectionLabel, "i"),
      }).first();
      if (await navLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await navLink.click();
        await Promise.race([
          page.waitForLoadState("domcontentloaded").catch(() => {}),
          page.waitForTimeout(5000),
        ]);
        return true;
      }
    } catch { /* fall through */ }
  }

  // 2. Generic section nav: look for links/tabs matching section label
  const searchTerms = [sectionLabel, sectionId.replace(/_/g, " ")];
  for (const term of searchTerms) {
    try {
      const link = page.locator(`nav a:has-text("${term}"), [role="tablist"] button:has-text("${term}"), .sidebar a:has-text("${term}"), a:has-text("${term}")`).first();
      if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
        await link.click();
        await Promise.race([
          page.waitForLoadState("domcontentloaded").catch(() => {}),
          page.waitForTimeout(5000),
        ]);
        return true;
      }
    } catch { /* try next */ }
  }

  return false;
}

/**
 * Click a button matching one of several text patterns separated by "|".
 */
async function clickButtonByText(page: Page, textPatterns: string): Promise<boolean> {
  for (const text of textPatterns.split("|")) {
    try {
      const btn = page.locator(`button:has-text("${text.trim()}"), a:has-text("${text.trim()}")`).first();
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click();
        return true;
      }
    } catch { /* try next pattern */ }
  }
  return false;
}

/**
 * Map section IDs to "company" or "financial" fill kind for the existing form-mapping.
 * Sections about money/budget use "financial"; everything else uses "company".
 */
function deriveFillKind(sectionId: string): "company" | "financial" {
  const financialSections = ["finances", "funding_details", "budget", "resources", "costs", "financial"];
  return financialSections.some((f) => sectionId.includes(f)) ? "financial" : "company";
}
