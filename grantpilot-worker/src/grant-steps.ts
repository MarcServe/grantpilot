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
  cleanupTempFiles,
  getFilledFormSnapshot,
  type FilledFormSnapshot,
  type FilledField,
} from "./browser.js";
import { getFormFillActions, getFileInputMapping } from "./form-mapping.js";
import {
  matchDocumentsToRequirements,
  buildUploadPlan,
  type RequiredAttachment,
} from "./required-attachments.js";
import { detectPageSituation, type PageSituation } from "./page-situation.js";

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
}

export interface GrantStepOptions {
  requiredAttachments?: RequiredAttachment[];
  /** User-edited snapshot fields; if present, submit uses these instead of re-mapping via Claude. */
  editedSnapshotFields?: FilledField[];
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
      const { ok, error } = await navigateToGrantUrl(page, grantUrl);
      if (!ok) {
        return { success: false, notes: error ?? "Navigate failed" };
      }
      const { situation, needsDirectUrl } = await detectPageSituation(page);
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
      if (situation === "unknown") {
        return {
          success: false,
          notes: "This page doesn't look like an application form. Please open the specific grant or application page and update the application URL, then retry.",
          situation: "unknown",
          needsDirectUrl: needsDirectUrl ?? true,
        };
      }
      return { success: true, notes: `Opened ${grantUrl}` };
    }

    case "fill_company_details": {
      const fields = await getFormFields(page);
      const actions = await getFormFillActions(fields, profile, "company");
      if (actions.length === 0) {
        return { success: true, skipped: true, notes: "No company fields on form; skipped" };
      }
      const { applied, errors } = await applyFillActions(page, actions);
      const { situation } = await detectPageSituation(page);
      if (situation === "login_required") {
        return {
          success: false,
          notes: "Page redirected to sign-in. Sign in on the funder's site, then use the bookmarklet or Resume.",
          situation: "login_required",
        };
      }
      if (situation === "needs_verification") {
        return {
          success: false,
          notes: "Page requires account or email verification. Complete that on the funder's site, then use the bookmarklet or Resume.",
          situation: "needs_verification",
        };
      }
      if (situation === "competition_list") {
        return {
          success: false,
          notes: "Page is a list of schemes. Use the direct application URL for this grant, then retry.",
          situation: "competition_list",
          needsDirectUrl: true,
        };
      }
      const note =
        errors.length > 0
          ? `Filled ${applied} fields; errors: ${errors.join("; ")}`
          : `Filled ${applied} company fields`;
      return { success: applied > 0, notes: note };
    }

    case "fill_financials": {
      const fields = await getFormFields(page);
      const actions = await getFormFillActions(fields, profile, "financial");
      if (actions.length === 0) {
        return { success: true, skipped: true, notes: "No financial fields on form; skipped" };
      }
      const { applied, errors } = await applyFillActions(page, actions);
      const note =
        errors.length > 0
          ? `Filled ${applied} fields; errors: ${errors.join("; ")}`
          : `Filled ${applied} financial fields`;
      return { success: applied >= 0, notes: note };
    }

    case "upload_documents": {
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

        if (requiredAttachments.length > 0) {
          const matched = matchDocumentsToRequirements(requiredAttachments, documents);
          const plan = buildUploadPlan(selectors, documents, matched);
          orderedSelectors = plan.selectors;
          paths = [];
          for (const url of plan.documentUrls) {
            const p = await downloadToTemp(url);
            tempPaths.push(p);
            paths.push(p);
          }
          if (plan.missing.length > 0) {
            await page.evaluate(() => {}); // no-op, just for consistency
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
          documents.map((d) => d.name)
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
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const snapshot = await getFilledFormSnapshot(page);
      return {
        success: true,
        notes: "Form ready for review",
        snapshot,
      };
    }

    case "submit_application": {
      if (grantUrl) {
        const { ok, error: navErr } = await navigateToGrantUrl(page, grantUrl);
        if (!ok) return { success: false, notes: navErr ?? "Navigate failed" };
      }

      const editedFields = options?.editedSnapshotFields;
      if (editedFields && editedFields.length > 0) {
        await applySnapshotValues(page, editedFields);
      } else {
        const fields = await getFormFields(page);
        const companyActions = await getFormFillActions(fields, profile, "company");
        const financialActions = await getFormFillActions(fields, profile, "financial");
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
            if (requiredAttachments.length > 0) {
              const matched = matchDocumentsToRequirements(requiredAttachments, documents);
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
                documents.map((d) => d.name)
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
