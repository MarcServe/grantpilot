# Expert grant advisory workflow

This first version is administrator-managed while the expert panel is being assembled. It does not give experts their own accounts or automatically contact advisers.

## Enable

Apply `supabase/migrations/070_expert_grant_reviews.sql` in Supabase, then manually deploy `versiontwo` on Vercel. Without the migration, the review controls show a setup message; existing AI generation remains available.

## Applicant

Save a rejected application outcome and the exact funder response, then consent to review and choose **Request expert review**. The request remains **awaiting an available expert** until assigned. AI advice is labelled separately and does not claim a successful funding record or expert approval.

## Administrator

Open **Admin → Expert grant advisory requests** (`/admin/expert-reviews`). Check the adviser's relevant experience and successful-application references before assigning a request. Obtain permission to show the adviser name and references to the applicant. Collect the actual human review, then record and publish it with the verification attestation. Draft advice remains private. The publication records the administrator identity and time; it is not a digital signature by the expert.

A useful advisory report distinguishes what the funder confirmed from hypotheses; identifies any missing application material; prioritises evidence gaps and fixes; and explains whether to revise, resubmit or pursue another opportunity. No success guarantee is implied by a previous award or an adviser track record.

## Reuse

Completed reports are loaded only for the same organisation, business profile and selected grant in Question Assistant and Founder Pack generation. An applicant can also save their outcome feedback again to include the expert report in a new AI advisory analysis. Reports do not change confirmed profile facts or apply hidden eligibility score penalties.

Dedicated reviewer accounts, invitations, turnaround commitments and messaging are not included. Keep access to this admin queue with existing administrators while onboarding reviewers through your normal process.
