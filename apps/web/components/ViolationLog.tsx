import { ViolationRow } from "@scrapeverse/db";

export function ViolationLog({ violations }: { violations: ViolationRow[] }) {
  return (
    <ul className="violation-log">
      {violations.map((v) => (
        <li key={v.id} data-class={v.class}>
          <span className="violation-class">{v.class}</span> — {v.field}: {typeof v.detail === "string" ? v.detail : JSON.stringify(v.detail)}
        </li>
      ))}
    </ul>
  );
}
