/**
 * Records a live cassette for the Chaos Lab end-to-end heal cycle
 * (packages/sentinel/test/chaosLab.e2e.test.ts) against a real, deployed
 * Chaos Lab instance and live Bright Data credentials.
 *
 * Run manually, once, whenever Bright Data credits are confirmed available:
 *
 *   CHAOS_LAB_COLLECTOR_ID=... CHAOS_LAB_URL=... \
 *   BRIGHTDATA_API_KEY=... npx tsx scripts/record-chaos-lab-cassette.ts
 *
 * This script is NOT executed as part of this task or any CI run — there
 * are no live Bright Data credits available in this session. It exists so
 * the recording step is ready to go the moment credits are available, and
 * so the shape of a "real" recording (as opposed to the hand-written
 * fixtures currently checked in) is documented in code.
 *
 * ---------------------------------------------------------------------
 * IMPORTANT — cassette key-collision caveat, read before ever running this:
 * ---------------------------------------------------------------------
 * `CassetteRecorder`/`CassetteReplayer` (packages/brightdata/src/cassette.ts)
 * key a `runCollector` call purely on `` `run:${collectorId}:${url}` `` —
 * there is no call-ordinal or "which phase of the cycle" component in the
 * key. That means the THREE `runCollector` calls below (v1 baseline, v2
 * broken, and the post-heal verification call inside verifyAgainstGoldens)
 * all collapse onto the exact same cassette file on disk, because they all
 * use the same `collectorId` + `url` pair. Recording mode does not error on
 * this — `CassetteRecorder.record` just writes to a fixed path per key, so
 * each subsequent call to the same key silently overwrites the previous
 * one's recorded value. Concretely:
 *
 *   - After the v1 call below, the cassette holds the healthy baseline rows.
 *   - After the v2 call, the SAME file is overwritten with the broken rows.
 *     The v1 recording is gone — it was never actually a distinct fixture.
 *   - After the post-heal verification call at the bottom, the SAME file is
 *     overwritten again, this time (if the heal genuinely worked) with the
 *     healed rows.
 *
 * Net effect: a real recording run of this script produces a cassette
 * directory where `run:${collectorId}:${url}` reflects only the LAST
 * runCollector call that happened before the script exited — not a
 * three-stage timeline. Anyone re-running this script expecting three
 * independent "v1 / v2 / post-heal" run fixtures on disk afterward will be
 * surprised; there is only ever one `run_...json` slot for this
 * (collectorId, url) pair.
 *
 * This is a property of the cassette key scheme itself (Tasks 5/6, already
 * complete and reviewed), not a bug in this script. Fixing it would mean
 * adding a call-ordinal or phase component to the cassette key in
 * packages/brightdata/src/cassette.ts and createClient.ts — out of scope
 * for this task. Don't attempt to route around it here; just be aware that
 * a live recording run will only ever leave the LAST runCollector result
 * behind for a given (collectorId, url) pair, and plan accordingly (e.g. by
 * recording v1/v2/post-heal against distinct URLs if a real three-stage
 * cassette is ever needed).
 */
import { createBrightDataClient } from "@scrapeverse/brightdata";

async function main() {
  process.env.BRIGHTDATA_MODE = "record";
  const client = createBrightDataClient("cassettes/chaos-lab-full-cycle");
  const collectorId = process.env.CHAOS_LAB_COLLECTOR_ID!;
  const url = process.env.CHAOS_LAB_URL!;

  // v1: healthy baseline. NOTE: per the caveat above, this recording will be
  // silently overwritten by the very next runCollector call below — it is
  // not retrievable as a separate fixture once this script finishes.
  await client.runCollector(collectorId, url);

  // (operator flips Chaos Lab to v2 here, out of band, before the next call)
  await client.runCollector(collectorId, url); // v2: structural break, returns nulls

  const html1 = await client.scrape(url);
  await client.heal(collectorId, "Extraction returned nulls for price; re-extract per field description.");
  const html2 = await client.scrape(url);
  await client.runCollector(collectorId, url); // post-heal verification run — overwrites the v2 recording above
  await client.approve(collectorId, { autoSave: true });

  console.log("cassette recorded to cassettes/chaos-lab-full-cycle");
  console.log(`scraped ${html1.length} + ${html2.length} bytes of HTML evidence along the way`);
}

main();
