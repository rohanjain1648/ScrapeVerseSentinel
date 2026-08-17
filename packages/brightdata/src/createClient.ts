import { BrightDataClient } from "./types";
import { LiveBrightDataClient } from "./liveClient";
import { CassetteRecorder, CassetteReplayer } from "./cassette";

function wrapWithRecording(client: BrightDataClient, recorder: CassetteRecorder): BrightDataClient {
  return {
    trigger: (id, urls) => recorder.record(`trigger:${id}:${urls.join(",")}`, () => client.trigger(id, urls)),
    getDataset: (id) => recorder.record(`dataset:${id}`, () => client.getDataset(id)),
    runCollector: (id, url) => recorder.record(`run:${id}:${url}`, () => client.runCollector(id, url)),
    heal: (id, prompt) => recorder.record(`heal:${id}:${prompt}`, () => client.heal(id, prompt)),
    approve: (id, opts) => recorder.record(`approve:${id}`, () => client.approve(id, opts)),
    scrape: (url) => recorder.record(`scrape:${url}`, () => client.scrape(url)),
  };
}

function wrapWithReplay(replayer: CassetteReplayer): BrightDataClient {
  return {
    trigger: (id, urls) => replayer.replay(`trigger:${id}:${urls.join(",")}`),
    getDataset: (id) => replayer.replay(`dataset:${id}`),
    runCollector: (id, url) => replayer.replay(`run:${id}:${url}`),
    heal: (id, prompt) => replayer.replay(`heal:${id}:${prompt}`),
    approve: (id) => replayer.replay(`approve:${id}`),
    scrape: (url) => replayer.replay(`scrape:${url}`),
  };
}

export function createBrightDataClient(cassetteDir = "cassettes"): BrightDataClient {
  const mode = process.env.BRIGHTDATA_MODE ?? "replay";
  if (mode === "replay") {
    return wrapWithReplay(new CassetteReplayer(cassetteDir));
  }
  const live = new LiveBrightDataClient({
    apiKey: process.env.BRIGHTDATA_API_KEY ?? "",
    baseUrl: process.env.BRIGHTDATA_API_BASE ?? "https://api.brightdata.com",
  });
  if (mode === "record") {
    return wrapWithRecording(live, new CassetteRecorder(cassetteDir));
  }
  return live; // "live"
}
