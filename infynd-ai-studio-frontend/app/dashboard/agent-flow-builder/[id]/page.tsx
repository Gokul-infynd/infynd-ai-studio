import AgentFlowBuilder from "@/components/agents/AgentFlowBuilder";

export default async function AgentFlowBuilderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  return <AgentFlowBuilder rootAgentId={resolvedParams.id} />;
}
