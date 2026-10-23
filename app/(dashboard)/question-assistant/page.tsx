import { redirect } from "next/navigation";
export default async function QuestionAssistantAlias({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = new URLSearchParams(await searchParams);
  redirect(`/grant-assistant${params.size ? `?${params}` : ""}`);
}
