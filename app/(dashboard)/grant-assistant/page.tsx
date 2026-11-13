import FounderPackPage from "../founder-pack/page";
export default async function GrantAssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ grantId?: string; applicationId?: string; requirementId?: string; criterionId?: string; prepare?: string; scheme?: string; loanDocument?: string; draftKind?: string }>;
}) {
  return FounderPackPage({
    searchParams: Promise.resolve({
      ...(await searchParams),
      workspace: "questions",
    }),
  });
}
