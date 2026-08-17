import { createSupabaseClient, listCollectors } from "@scrapeverse/db";
import * as db from "@scrapeverse/db";
import { createBrightDataClient } from "@scrapeverse/brightdata";
import { runSentinelCycle, SentinelDb } from "@scrapeverse/sentinel";
import { FieldContract } from "@scrapeverse/contracts";

function toSentinelDb(client: ReturnType<typeof createSupabaseClient>): SentinelDb {
  return {
    getLatestContract: async (id) => {
      const row = await db.getLatestContract(client, id);
      return row ? (row.fields as any) : null;
    },
    saveContract: async (id, fields) => {
      const existing = await db.getLatestContract(client, id);
      await db.saveContract(client, id, (existing?.version ?? 0) + 1, fields);
    },
    getTrailingRuns: async (id, n) => {
      const rows = await db.getTrailingRuns(client, id, n);
      return rows.map((r) => ({ rows: r.rows as unknown[] }));
    },
    saveRun: (id, rows, status) => db.saveRun(client, id, rows, status),
    saveViolations: (runId, violations) => db.saveViolations(client, runId, violations),
    getGoldens: async (id) => {
      const rows = await db.getGoldens(client, id);
      return rows.map((r) => ({ url: r.url, expected: r.expected as Record<string, string | number | null> }));
    },
    saveHealAttempt: async (attempt) => {
      await db.saveHealAttempt(client, attempt);
    },
    countRecentHealAttempts: (id, hours) => db.countRecentHealAttempts(client, id, hours),
    countConsecutiveRejections: (id) => db.countConsecutiveRejections(client, id),
  };
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const client = createSupabaseClient();
  const collectors = await listCollectors(client);
  const brightData = createBrightDataClient();
  const sentinelDb = toSentinelDb(client);

  const results = [];
  for (const collector of collectors) {
    try {
      // Build fieldDescriptions from the collector's latest human-authored
      // contract so heal prompts carry real semantics ("current selling price
      // including the currency symbol") instead of falling back to bare field
      // names. No contract yet (first-ever run) -> {} is correct, same as today.
      const latestContract = await db.getLatestContract(client, collector.id);
      const fields = (latestContract?.fields as FieldContract[] | undefined) ?? [];
      const fieldDescriptions = Object.fromEntries(fields.map((f) => [f.name, f.description]));

      const result = await runSentinelCycle(collector.id, collector.source_url, fieldDescriptions, { brightData, db: sentinelDb });
      await db.setCollectorState(client, collector.id, result.finalState);
      results.push({ collectorId: collector.id, ...result });
    } catch (err) {
      results.push({ collectorId: collector.id, error: String(err) });
    }
  }

  return Response.json({ swept: results.length, results });
}

// Vercel Cron Jobs invoke the scheduled path with a GET request (carrying the
// same `Authorization: Bearer $CRON_SECRET` header as a manual POST), so the
// route must respond to GET too or the cron gets a 405 on every scheduled run.
export const GET = POST;
