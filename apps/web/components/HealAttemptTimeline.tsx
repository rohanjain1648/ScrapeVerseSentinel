import { HealAttemptRow } from "@scrapeverse/db";

export function HealAttemptTimeline({ attempts }: { attempts: HealAttemptRow[] }) {
  return (
    <ol className="heal-timeline">
      {attempts.map((a) => (
        <li key={a.id} data-state={a.state}>
          <time>{new Date(a.decided_at).toLocaleString()}</time>
          <span className="state-badge">{a.state}</span>
          <details>
            <summary>Prompt sent to Bright Data</summary>
            <pre>{a.prompt}</pre>
          </details>
          {a.verification_result ? (
            <p className="verification">{JSON.stringify(a.verification_result)}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
