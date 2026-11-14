# Start Up Loan readiness segment

## Entry points

- `/start-up-loans`: public, rules-based initial assessment, with no account or credit search required.
- `/loans/start-up-loans`: saved applicant intake, also linked from the dashboard menu.
- `/admin/loan-readiness`: latest 100 saved intakes where applicants explicitly consented to adviser access. Existing admins manage this view; it does not create expert logins or send messages.

Apply `supabase/migrations/071_start_up_loan_intakes.sql` before using persistence. Deploy `versiontwo` manually on Vercel.

## Information and ownership

Business name, description and actual trading date are offered as editable prefill. The applicant must confirm them; incorporation is not substituted for trading. Answers are stored separately from Business DNA, scoped by organisation, business profile and applicant user. No direct browser-role database access is granted. Saves use the previous update timestamp to reject conflicting edits.

The public assessment collects basic declarations. Its optional same-browser signup handoff excludes visa and personal-budget answers; users choose whether to import it after sign-in. Signed-in applicants may provide structured discovery notes, optional personal-budget totals and document readiness. Raw identity documents, visas and bank statements are not uploaded by this form. Document readiness remains self-reported.

Sharing with an adviser is off by default. Saving after unchecking consent removes the intake from future shared-queue fetches. This cannot recall copies already shared externally.

## Rules and limitations

Checks explain each answer, condition and next action. They cover core declarations, business activity and purpose exclusions, trading/ownership duration, acquisitions, franchises, community cases, equity/control, partner shares and combined borrowing. Exactly 60 months and unclear cases go to lender clarification. Universal Credit is not an automatic exclusion. A pretrading declaration conflicting with a past trading date is highlighted.

Visa type eligibility and repayment timing are separate checks. Modern permissions are not automatically mapped to legacy visa names in the official FAQ. For time-limited permissions, the proposed final payment date must be no later than six calendar months before current expiry. Proposed start dates are estimates; no renewal or lender schedule is assumed. The app shows a date-compatible term ceiling capped at 60 months, not an offered term or affordability recommendation.

CreditLock is a self-declared readiness reminder; the app cannot inspect or unlock Experian. Repayment figures use standard monthly amortisation at the published 7.5% annual rate, are illustrative and can differ with rounding or actual payment dates. Only the lender performs credit, affordability, identity and viability assessments.

## Document preparation

Loan-specific Question Assistant requests carry an explicit scheme marker and load the latest saved intake on the server for the same applicant and profile. They reject unrelated selected grant/application context. Missing figures remain unconfirmed. Personal income is not inferred from company turnover.

Official planning resources link to the business plan, cash-flow and personal-budget templates, plus the attached 22-page growth guide. Preparation prompts reference the guide's funding-readiness discussion on pages 13–14 as optional planning advice, not eligibility rules. Text drafts do not populate or validate the lender's XLSX workbook.

## Verification

`npm run test:start-up-loan-readiness` covers date boundaries, acquisition exceptions, partnership limits, exclusions, benefit treatment, visa deadlines, calendar-month rounding, repayment arithmetic and applicant/profile/org scoping. Browser checks use mocked storage APIs for conflicts, consent and saved state. Live Supabase persistence and AI generation require validation after applying migration 071 and manually deploying.

## Six-task preparation workspace

Apply migration 072 after 071. The workspace lives only in StartUpLoanIntake.workspace; it does not write BusinessProfile, grant assessments, Founder Pack or Data Vault records. Existing intake saves preserve this column. No external partner account or access is created by typing an assignee name.

Applicants track six tasks with statuses and shared preparation notes. Administrators can record partner responsibility and due dates on currently consented cases. Only the applicant can set applicant-approved status; administrators can request changes. Progress and dates are administrative declarations, not verified document reviews or lender approval. Notes should not contain identity numbers or bank details.

Every write checks the current intake timestamp. Conflicting changes require reload; intake and workspace saves share a revision to prevent lost concurrent edits. Administrator reads and writes require current shareWithAdviser consent; applicant reads and writes are scoped to organisation, active business and applicant user. Browser database access remains blocked by the existing RLS policy. Admin task workspaces load only when opened.

This phase records preparation progress and responsibility. Partner invitations, restricted partner logins, document-version review, formula-driven forecast exports and referral discounts are not implemented by this workspace. Official submission remains in the lender portal. No automatic notifications or external sharing occur.

Verification: scripts/test-start-up-loan-workspace.ts tests immutable changes, assignment and approval actor boundaries, date/note validation and the six-task scope. Authenticated live Supabase persistence requires migration 072 and deployment validation.
