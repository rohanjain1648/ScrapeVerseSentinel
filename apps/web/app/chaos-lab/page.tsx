"use client";
import { useState, useEffect } from "react";

const VERSIONS = ["v1", "v2", "v3", "semantic"] as const;

export default function ChaosLabControlPage() {
  const [version, setVersion] = useState<string>("v1");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/chaos-lab/version");
        if (!res.ok) {
          setError("Could not reach Chaos Lab — is it running?");
          return;
        }
        const data = await res.json();
        setVersion(data.version);
        setError(null);
      } catch {
        setError("Could not reach Chaos Lab — is it running?");
      }
    })();
  }, []);

  async function setLayoutVersion(v: string) {
    try {
      const res = await fetch("/api/chaos-lab/version", {
        method: "POST",
        body: JSON.stringify({ version: v }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to set version");
        return;
      }
      const data = await res.json();
      setVersion(data.version);
      setError(null);
    } catch {
      setError("Failed to set version");
    }
  }

  return (
    <main>
      <h1>Chaos Lab Control</h1>
      <p>Current layout: <strong>{version}</strong></p>
      {error && <p className="error">{error}</p>}
      <div className="version-buttons">
        {VERSIONS.map((v) => (
          <button key={v} onClick={() => setLayoutVersion(v)} disabled={v === version}>
            Switch to {v}
          </button>
        ))}
      </div>
    </main>
  );
}
