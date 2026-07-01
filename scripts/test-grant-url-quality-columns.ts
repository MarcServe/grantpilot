import assert from "node:assert/strict";
import { isMissingGrantUrlQualityColumnsError } from "../lib/grant-url-quality-columns";

assert.equal(
  isMissingGrantUrlQualityColumnsError({
    code: "42703",
    message: 'column Grant.applicationUrlQuality does not exist',
  }),
  true,
  "Postgres undefined-column errors should trigger URL-quality fallback"
);

assert.equal(
  isMissingGrantUrlQualityColumnsError({
    message: "Could not find the 'directApplicationUrl' column of 'Grant' in the schema cache",
  }),
  true,
  "Supabase schema-cache errors for URL-quality fields should trigger fallback"
);

assert.equal(
  isMissingGrantUrlQualityColumnsError({
    code: "PGRST301",
    message: "JWT expired",
  }),
  false,
  "Unrelated database errors should not be hidden by the fallback"
);

console.log("grant URL-quality missing-column fallback checks passed");
