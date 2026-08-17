import { createSupabaseClient, listByProduct } from "@scrapeverse/db";
import { detectShrinkflation, ShrinkflationFlag } from "@scrapeverse/shelf-truth";
import { ShrinkflationTable } from "../../components/ShrinkflationTable";

const TRACKED_PRODUCT_IDS = ["p1", "p2", "p3", "p4", "p5"];

// price_observations stores an already-normalized unit_price (paired with
// pack_size_normalized/unit — see schema.sql), the same shape computeUnitPrice
// produces. detectShrinkflation's ProductSnapshot instead expects a raw pack
// price and re-derives the unit price itself via computeUnitPrice(price, pack).
// Feeding the stored unit_price straight in would double-normalize it, so
// reconstruct the raw price from the row's own already-known pack quantity
// before handing it to detectShrinkflation.
function toRawPrice(row: { unit_price: number; pack_size_normalized: number }): number {
  return (row.unit_price * row.pack_size_normalized) / 100;
}

// This page reads live Supabase data on every request; without this, Next 15
// would try to statically prerender it at build time (failing the build if
// env vars are absent, or freezing it at build-time data if present).
export const dynamic = "force-dynamic";

export default async function ShelfTruthPage() {
  const client = createSupabaseClient();
  const flags: ShrinkflationFlag[] = [];

  for (const productId of TRACKED_PRODUCT_IDS) {
    const observations = await listByProduct(client, productId);

    // Group by retailer first — observations from different retailers are not
    // comparable pairwise (interleaved timestamps would otherwise pair e.g. a
    // bigbasket row with a blinkit row and misattribute retailer variance as
    // shrinkflation).
    const byRetailer = new Map<string, typeof observations>();
    for (const obs of observations) {
      const list = byRetailer.get(obs.retailer) ?? [];
      list.push(obs);
      byRetailer.set(obs.retailer, list);
    }

    for (const retailerObservations of byRetailer.values()) {
      const sorted = [...retailerObservations].sort((a, b) => a.observed_at.localeCompare(b.observed_at));
      for (let i = 1; i < sorted.length; i++) {
        // detectShrinkflation calls normalizePackSize internally, which throws on a
        // malformed/unparseable pack-size string. That's expected behavior of that
        // function, not a bug — so a single bad record must not abort the whole
        // dashboard page. Skip just that pair on failure and keep going.
        try {
          const flag = detectShrinkflation(
            { productId, retailer: sorted[i - 1].retailer, packSizeRaw: sorted[i - 1].pack_size_raw, price: toRawPrice(sorted[i - 1]), observedAt: sorted[i - 1].observed_at },
            { productId, retailer: sorted[i].retailer, packSizeRaw: sorted[i].pack_size_raw, price: toRawPrice(sorted[i]), observedAt: sorted[i].observed_at }
          );
          if (flag) flags.push(flag);
        } catch {
          // Malformed pack-size string for this pair — skip it and continue.
          continue;
        }
      }
    }
  }

  return (
    <main>
      <h1>Shelf-Truth — Shrinkflation Watchdog</h1>
      <ShrinkflationTable flags={flags} />
    </main>
  );
}
