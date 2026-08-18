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

// Unidades "contables": las que tiene sentido ajustar de a una con un stepper +/-.
// Cada una con su forma singular (canónica, prolija, con acento) y plural. La detección
// ignora mayúsculas y acentos (ver normalizeToken), así "3 capsulas" == "3 Cápsulas".
const COUNTABLE_UNITS: ReadonlyArray<{ singular: string; plural: string }> = [
  { singular: "cápsula", plural: "cápsulas" },
  { singular: "pastilla", plural: "pastillas" },
  { singular: "comprimido", plural: "comprimidos" },
  { singular: "tableta", plural: "tabletas" },
  { singular: "gomita", plural: "gomitas" },
  { singular: "perla", plural: "perlas" },
  { singular: "gragea", plural: "grageas" },
  { singular: "unidad", plural: "unidades" },
];

function normalizeToken(s: string): string {
  // minúsculas + sin acentos (NFD y quita los diacríticos) + sin espacios en los bordes.
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Detecta dosis "contables" (ej. "3 cápsulas", "1 comprimido") para ofrecer un stepper +/-.
// Devuelve { count, unit } SOLO si:
//   - parseLeadingNumber(dose) da un ENTERO >= 0 (ej. "1,5 cápsulas" → null), Y
//   - el resto del string (sin el número) es exactamente una unidad contable conocida
//     (singular o plural, sin distinguir mayúsculas ni acentos).
// `unit` es la forma singular canónica prolija (con acento); reconstruí el label de la
// dosis con formatCountableDose(). Para dosis NO contables (ej. "10 g", "5 ml", "200 mg",
// "según necesidad") devuelve null y el llamador sigue con el texto libre.
export function parseCountableDose(dose: string | null | undefined): { count: number; unit: string } | null {
  if (dose == null) return null;
  const count = parseLeadingNumber(dose);
  if (count == null || !Number.isInteger(count)) return null;
  const m = dose.match(/-?(?:\d+(?:[.,]\d+)?|[.,]\d+)/);
  if (!m || m.index == null) return null;
  const rest = normalizeToken(dose.slice(m.index + m[0].length));
  for (const u of COUNTABLE_UNITS) {
    if (rest === normalizeToken(u.singular) || rest === normalizeToken(u.plural)) {
      return { count, unit: u.singular };
    }
  }
  return null;
}

// Reconstruye el label de una dosis contable a partir de un count y la unidad canónica
// (singular) devuelta por parseCountableDose. Regla de número: singular si count === 1,
// plural en cualquier otro caso (incluye 0: "0 cápsulas").
export function formatCountableDose(count: number, unit: string): string {
  const found = COUNTABLE_UNITS.find((u) => u.singular === unit);
  if (!found) return `${count} ${unit}`;
  return `${count} ${count === 1 ? found.singular : found.plural}`;
}
