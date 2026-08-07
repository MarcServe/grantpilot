import assert from "node:assert/strict";
import {
  classifyGrantApplicationUrl,
  classifyGrantPageText,
  isGrantAggregatorClassificationReason,
  isGrantAggregatorUrl,
  shouldExposeApplyCta,
} from "../lib/grant-application-url-quality";

assert.equal(
  classifyGrantApplicationUrl("https://forms.gle/abc123").kind,
  "direct_form",
  "Google Forms links should be direct forms"
);

assert.equal(
  classifyGrantApplicationUrl("https://airtable.com/app123/shr456").quality,
  "verified_direct",
  "Airtable form links should be verified direct"
);

assert.equal(
  classifyGrantApplicationUrl("https://www.bristol.gov.uk/business-support-advice").kind,
  "generic_listing",
  "Bristol business support landing page should not be treated as an application form"
);

const aggregatorClassification = classifyGrantApplicationUrl("https://www.grantsonline.org.uk/grants-search");
assert.equal(aggregatorClassification.kind, "generic_listing");
assert.equal(aggregatorClassification.quality, "rejected");
assert.equal(
  isGrantAggregatorClassificationReason(aggregatorClassification.reason),
  true,
  "Known grant aggregators should get a clear non-funder reason"
);
assert.equal(isGrantAggregatorUrl("https://fundingcentral.org.uk/"), true);

assert.equal(
  classifyGrantPageText({
    url: "https://www.nesta.org.uk/project/careertech-challenge/",
    title: "CareerTech Challenge Fund",
    bodyText:
      "Apply to the CareerTech Challenge Fund by 2pm 9th December 2019. Applications close 9th Dec 2019.",
    now: new Date("2026-06-24T12:00:00Z"),
  }).kind,
  "closed_or_expired",
  "Historic application deadline text should mark the opportunity closed"
);

assert.equal(
  classifyGrantPageText({
    url: "https://apply.startuploans.co.uk/thank-you",
    title: "Thank you",
    bodyText:
      "Your Start Up Loans account has been successfully created and we have emailed you a link to activate your account.",
    now: new Date("2026-06-24T12:00:00Z"),
  }).kind,
  "account_registration",
  "Account-created confirmation pages should not be sold as direct grant forms"
);

assert.equal(shouldExposeApplyCta({ quality: "verified_direct" }), true);
assert.equal(shouldExposeApplyCta({ quality: "verified_portal" }), true);
assert.equal(shouldExposeApplyCta({ quality: "needs_scout" }), false);
assert.equal(shouldExposeApplyCta({ quality: "rejected" }), false);

console.log("grant application URL quality tests passed");
