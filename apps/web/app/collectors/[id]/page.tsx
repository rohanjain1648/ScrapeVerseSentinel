import { createSupabaseClient, getCollector, getLatestContract, listViolations, listHealAttempts } from "@scrapeverse/db";
import { ContractView } from "../../../components/ContractView";
import { ViolationLog } from "../../../components/ViolationLog";
import { HealAttemptTimeline } from "../../../components/HealAttemptTimeline";

// This page reads live Supabase data on every request; without this, Next 15
// would try to statically prerender it at build time (failing the build if
// env vars are absent, or freezing it at build-time data if present).
export const dynamic = "force-dynamic";

export default async function CollectorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = createSupabaseClient();
  const collector = await getCollector(client, id);
  const contract = await getLatestContract(client, id);
  const violations = await listViolations(client, id, 50);
  const healAttempts = await listHealAttempts(client, id, 50);

  if (!collector) return <p>Collector not found.</p>;

  return (
    <main>
      <h1>{collector.name}</h1>
      <p>State: <strong>{collector.state}</strong></p>
      <h2>Contract</h2>
      <ContractView fields={(contract?.fields as any) ?? []} />
      <h2>Recent violations</h2>
      <ViolationLog violations={violations} />
      <h2>Heal attempts</h2>
      <HealAttemptTimeline attempts={healAttempts} />
    </main>
  );
}
