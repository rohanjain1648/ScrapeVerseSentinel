import { ShrinkflationFlag } from "@scrapeverse/shelf-truth";

export function ShrinkflationTable({ flags }: { flags: ShrinkflationFlag[] }) {
  if (flags.length === 0) {
    return <p>No shrinkflation detected in the current window.</p>;
  }
  return (
    <table className="shrinkflation-table">
      <thead><tr><th>Product</th><th>Retailer</th><th>Pack change</th><th>Unit price increase</th></tr></thead>
      <tbody>
        {flags.map((f, i) => (
          <tr key={`${f.productId}-${f.retailer}-${i}`}>
            <td>{f.productId}</td>
            <td>{f.retailer}</td>
            <td>{f.packSizeChange}</td>
            <td>{f.unitPriceIncreasePct.toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
