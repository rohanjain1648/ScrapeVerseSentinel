import { renderStorefront, LayoutVersion } from "../lib/layoutVersions";
import { PRODUCTS } from "../lib/products";

async function getVersion(): Promise<LayoutVersion> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001"}/api/version`, { cache: "no-store" });
  const data = await res.json();
  return data.version;
}

export default async function StorefrontPage() {
  const version = await getVersion();
  return renderStorefront(version, PRODUCTS);
}
