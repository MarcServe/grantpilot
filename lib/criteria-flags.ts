export function criteriaEnabled(): boolean {
  return process.env.GRANTS_CRITERIA_V1 === "true";
}
