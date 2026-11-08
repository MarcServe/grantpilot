const PROJECT_FIELDS = ["projectTitle", "projectSummary", "problemStatement", "proposedSolution", "projectObjectives", "expectedOutcomes", "projectStartDate", "projectEndDate", "milestones", "deliverables", "innovationCapabilities", "teamExpertise", "risksMitigation", "partnerOrganisations"];
export function profileProjectEvidence(profile: Record<string, unknown>): string {
  return PROJECT_FIELDS.flatMap((key) => {
    const value = profile[key] ?? profile[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)];
    return value == null || String(value).trim() === "" ? [] : [`${key}: ${String(value)}`];
  }).join("\n");
}
