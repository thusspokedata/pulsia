// Extrae el primer número de un texto de dosis ("1 cápsula" → 1, "1,5 g" → 1.5). Acepta coma
// decimal (es-AR). Devuelve null si no hay número parseable (ej. "según necesidad"): el llamador
// decide el fallback. Clampa a >= 0 — una dosis negativa no tiene sentido.
export function parseLeadingNumber(s: string | null | undefined): number | null {
  if (s == null) return null;
  const m = s.match(/-?(?:\d+(?:[.,]\d+)?|[.,]\d+)/);
  if (!m) return null;
  const n = Number(m[0].replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n);
}
