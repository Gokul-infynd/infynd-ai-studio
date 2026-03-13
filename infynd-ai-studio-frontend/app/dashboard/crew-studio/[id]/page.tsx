import { redirect } from "next/navigation";

export default async function LegacyCrewStudioDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  redirect(`/dashboard/agent-flow-builder/${resolvedParams.id}`);
}
