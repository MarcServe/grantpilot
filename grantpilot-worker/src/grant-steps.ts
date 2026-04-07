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
import { getFormFillActions, getFormFillActionsWithMissing, getFileInputMapping, extractRequiredAttachmentsFromPage, type MissingRequiredField } from "./form-mapping.js";
import {
  matchDocumentsToRequirements,
  buildUploadPlan,
  type RequiredAttachment,
} from "./required-attachments.js";
import { detectPageSituation, quickPageCheck, analyzeFormFields, type PageSituation } from "./page-situation.js";

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
      return { success: totalApplied > 0, notes: note };
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
      return { success: totalApplied >= 0, notes: note };
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
      // Pre-review validation: verify we actually filled substantive form fields
      const fieldAnalysis = await analyzeFormFields(page);
      if (fieldAnalysis.applicationFieldCount === 0 && fieldAnalysis.totalFields > 0) {
        return {
          success: false,
          notes: `Page has ${fieldAnalysis.totalFields} inputs but none are application fields (all are search/filter/navigation). This does not appear to be a grant application form.`,
          situation: "unknown",
          needsDirectUrl: true,
        };
      }

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const snapshot = await getFilledFormSnapshot(page);

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
      // Pre-fill page check
      const pageCheck = await preFillPageCheck(page, "submitting");
      if (pageCheck) return pageCheck;

      if (grantUrl) {
        const { ok, error: navErr } = await navigateToGrantUrl(page, grantUrl);
        if (!ok) return { success: false, notes: navErr ?? "Navigate failed" };
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

    default:
      return {
        success: false,
        notes: `Unknown action: ${action}`,
      };
  }
}
