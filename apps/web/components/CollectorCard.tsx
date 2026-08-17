import { CollectorRow } from "@scrapeverse/db";

export function CollectorCard({ collector }: { collector: CollectorRow }) {
  return (
    <div data-state={collector.state} className={`collector-card collector-card--${collector.state.toLowerCase()}`}>
      <h3>{collector.name}</h3>
      <p className="target-site">{collector.target_site}</p>
      <span className="state-badge">{collector.state}</span>
    </div>
  );
}
