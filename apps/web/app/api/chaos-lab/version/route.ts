const CHAOS_LAB_ADMIN_URL = process.env.CHAOS_LAB_ADMIN_URL ?? "http://localhost:3001";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "malformed JSON body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${CHAOS_LAB_ADMIN_URL}/api/version`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    return Response.json(await res.json(), { status: res.status });
  } catch (err) {
    return Response.json({ error: "failed to reach Chaos Lab admin API: " + String(err) }, { status: 502 });
  }
}

export async function GET() {
  try {
    const res = await fetch(`${CHAOS_LAB_ADMIN_URL}/api/version`, { cache: "no-store" });
    return Response.json(await res.json(), { status: res.status });
  } catch (err) {
    return Response.json({ error: "failed to reach Chaos Lab admin API: " + String(err) }, { status: 502 });
  }
}