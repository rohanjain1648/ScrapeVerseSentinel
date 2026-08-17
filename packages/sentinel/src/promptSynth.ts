import { Violation } from "@scrapeverse/contracts";

export function composeHealPrompt(
  violations: Violation[],
  fieldDescriptions: Record<string, string>,
  domDiff: string
): string {
  const lines: string[] = [];

  for (const v of violations) {
    const description = fieldDescriptions[v.field] ?? v.field;
    lines.push(`The "${v.field}" field (${description}) failed: ${v.detail}.`);
    lines.push(`Previously observed: ${v.evidence.expected}. Now observed: ${v.evidence.observed}.`);
    if (v.class === "DRIFT") {
      lines.push(
        `This value is well-formed but its distribution has shifted — it is likely extracting the wrong field entirely ` +
        `(for example, a struck-through MSRP instead of the current sale price, or a cached/stale price). ` +
        `Re-extract the field described above, not the struck-through MSRP or any similar-looking decoy value.`
      );
    }
  }

  lines.push(`DOM changes since the last known-good extraction: ${domDiff}.`);
  lines.push(`Extract the field(s) above according to their description, ignoring any decoy values that match the old selector but no longer represent the described data.`);

  return lines.join("\n");
}
