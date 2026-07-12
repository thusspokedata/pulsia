export function buildEcgSummary(
  recordings: { recordedAt: string | null; kardiaVerdict: string | null }[],
): string {
  const items = recordings
    .filter((r) => r.kardiaVerdict)
    .sort((a, b) => (a.recordedAt ?? "").localeCompare(b.recordedAt ?? ""));
  if (items.length === 0) return "";
  const parts = items.map((r) => `${r.recordedAt ?? "s/f"} ${r.kardiaVerdict}`);
  return `ECG (Kardia): ${parts.join("; ")}`;
}
