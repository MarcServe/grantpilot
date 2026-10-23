import FounderPackPage from "../founder-pack/page";
export default async function GrantAssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ grantId?: string; applicationId?: string }>;
}) {
  return FounderPackPage({
    searchParams: Promise.resolve({
      ...(await searchParams),
      workspace: "questions",
    }),
  });
}
