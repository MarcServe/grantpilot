type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
};

const URL_QUALITY_COLUMN_PATTERN =
  /applicationUrlQuality|applicationUrlKind|applicationUrlQualityReason|applicationUrlConfidence|applicationUrlVerifiedAt|directApplicationUrl|detailUrl|column .* does not exist/i;

export function isMissingGrantUrlQualityColumnsError(error: SupabaseLikeError | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42703" || URL_QUALITY_COLUMN_PATTERN.test(error.message ?? "");
}
