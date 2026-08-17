function extractSelectors(html: string): Set<string> {
  const selectors = new Set<string>();
  const classMatches = html.matchAll(/class="([^"]+)"/g);
  for (const m of classMatches) for (const cls of m[1].split(/\s+/)) selectors.add(`.${cls}`);
  const dataMatches = html.matchAll(/data-[\w-]+="[^"]*"/g);
  for (const m of dataMatches) selectors.add(`[${m[0].split("=")[0]}]`);
  return selectors;
}

export function diffDom(oldHtml: string, newHtml: string): string {
  const oldSelectors = extractSelectors(oldHtml);
  const newSelectors = extractSelectors(newHtml);

  const removed = [...oldSelectors].filter((s) => !newSelectors.has(s));
  const added = [...newSelectors].filter((s) => !oldSelectors.has(s));

  if (removed.length === 0 && added.length === 0) {
    return "no structural change detected between snapshots";
  }

  const parts: string[] = [];
  if (removed.length > 0) parts.push(`removed selectors: ${removed.join(", ")}`);
  if (added.length > 0) parts.push(`new selectors: ${added.join(", ")}`);
  return parts.join(" | ");
}
