import { createSupabaseClient, listCollectors } from "@scrapeverse/db";
import { CollectorCard } from "../components/CollectorCard";

// This page reads live Supabase data on every request; without this, Next 15
// would try to statically prerender it at build time (failing the build if
// env vars are absent, or freezing it at build-time data if present).
export const dynamic = "force-dynamic";

export default async function CollectorListPage() {
  const client = createSupabaseClient();
  const collectors = await listCollectors(client);
  return (
    <main>
      <h1>ScrapeVerse Sentinel</h1>
      <div className="collector-grid">
        {collectors.map((c) => <CollectorCard key={c.id} collector={c} />)}
      </div>
    </main>
  );
}
