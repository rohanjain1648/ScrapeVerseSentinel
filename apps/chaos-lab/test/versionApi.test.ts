import { describe, it, expect, beforeEach } from "vitest";
import { GET, POST } from "../app/api/version/route";

describe("layout version API", () => {
  it("defaults to v1", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.version).toBe("v1");
  });

  it("updates the version on POST and reflects it on subsequent GET", async () => {
    await POST(new Request("http://localhost/api/version", { method: "POST", body: JSON.stringify({ version: "v2" }) }));
    const res = await GET();
    const body = await res.json();
    expect(body.version).toBe("v2");
  });

  it("rejects an unknown version value", async () => {
    const res = await POST(new Request("http://localhost/api/version", { method: "POST", body: JSON.stringify({ version: "v99" }) }));
    expect(res.status).toBe(400);
  });
});
