import { FieldContract } from "@scrapeverse/contracts";

export function ContractView({ fields }: { fields: FieldContract[] }) {
  return (
    <table className="contract-view">
      <thead><tr><th>Field</th><th>Type</th><th>Null rate max</th><th>Range</th></tr></thead>
      <tbody>
        {fields.map((f) => (
          <tr key={f.name}>
            <td>{f.name}</td>
            <td>{f.type}{f.currency ? ` (${f.currency})` : ""}</td>
            <td>{(f.nullRate.max * 100).toFixed(0)}%</td>
            <td>{f.numericRange ? `${f.numericRange.min} – ${f.numericRange.max}` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
