export function buildEcgSummary(
  recordings: {
    recordedAt: string | null;
    kardiaVerdict: string | null;
    avgHr?: number | null;
    createdAt?: Date | number | string | null;
  }[],
): string {
  const items = recordings
    .filter((r) => r.kardiaVerdict)
    // Ordenamos por createdAt (fecha de subida, siempre parseable). recordedAt es texto libre que
    // extrae Opus (p.ej. "Sunday, 12 Jul 2026, 9:23 pm") y NO ordena cronológicamente por string.
    // Fallback a recordedAt si falta createdAt.
    .sort((a, b) => {
      const ta = a.createdAt != null ? new Date(a.createdAt).getTime() : NaN;
      const tb = b.createdAt != null ? new Date(b.createdAt).getTime() : NaN;
      if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
      return (a.recordedAt ?? "").localeCompare(b.recordedAt ?? "");
    });
  if (items.length === 0) return "";
  // Incluimos la FC media por lectura para que Opus pueda notar tendencias de frecuencia
  // (el prompt ya se lo pide). La omitimos si no se extrajo.
  const parts = items.map((r) => {
    const hr = r.avgHr != null ? `, FC media ${Math.round(r.avgHr)} lpm` : "";
    return `${r.recordedAt ?? "s/f"} ${r.kardiaVerdict}${hr}`;
  });
  return `ECG (Kardia), del más antiguo al más reciente: ${parts.join("; ")}`;
}
