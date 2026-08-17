const VALID_VERSIONS = ["v1", "v2", "v3", "semantic"] as const;
type LayoutVersion = (typeof VALID_VERSIONS)[number];

let currentVersion: LayoutVersion = "v1";

export async function GET() {
  return Response.json({ version: currentVersion });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!VALID_VERSIONS.includes(body.version)) {
    return Response.json({ error: `invalid version: ${body.version}` }, { status: 400 });
  }
  currentVersion = body.version;
  return Response.json({ version: currentVersion });
}
