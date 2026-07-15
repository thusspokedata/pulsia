import { frequencyAppliesOn, splitDate } from "./checklist";
import type { Frequency, Supplement } from "../schemas/supplements";

// 14 = LCM de los períodos de las frecuencias actuales: every_other_day tiene período 2,
// weekdays tiene período 7, y como 2 y 7 son coprimos, 14 días consecutivos cubren TODAS
// las combinaciones paridad × día-de-semana (daily es período 1, trivial). Si se agrega
// una variante de frecuencia en FrequencySchema (supplements.ts), recalcular: LCM de los
// períodos de todas las variantes.
const SCAN_DAYS = 14;

// Prefijos genéricos que no identifican el componente por sí solos: con una sola palabra,
// "Vitamina C" y "Vitamina D3" (productos distintos) colisionarían en "vitamina". Para
// estos casos la clave usa las primeras DOS palabras. No usar siempre dos palabras: eso
// rompería el agrupado deseado de "Magnesio (citrato)" vs "Magnesio bisglicinato".
const GENERIC_PREFIXES = new Set([
  "vitamina", "vitamin", "vitamine", "vit",
  "ácido", "acido", "acid",
  "extracto", "extract", "extrakt",
  "omega",
]);

// Clave de agrupado: primera palabra del nombre del componente, minúscula, sin paréntesis
// ("Magnesio (citrato)" y "Magnesio bisglicinato" → "magnesio"). Si la primera palabra es
// un prefijo genérico (ver arriba), se agrega la segunda ("vitamina c" ≠ "vitamina d3").
function componentGroupKey(componentName: string): string {
  const withoutParens = componentName.replace(/\([^)]*\)/g, " ");
  const words = withoutParens.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const first = words[0] ?? "";
  if (GENERIC_PREFIXES.has(first) && words[1]) return `${first} ${words[1]}`;
  return first;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = splitDate(date);
  const next = new Date(Date.UTC(y, m, d + days));
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Detecta componentes activos que se solapan entre ítems del plan el mismo día.
// Agrupa por componentGroupKey (ver arriba) y chequea los próximos SCAN_DAYS días con
// frequencyAppliesOn; si algún día 2+ ítems (de PRODUCTOS distintos) comparten componente
// → warning por componente. El mismo supplementId en 2 franjas NO es duplicación (split dosing
// del mismo producto), así que se ignora.
export function detectComponentOverlaps(
  items: { supplementId: string; frequency: Frequency }[],
  catalog: Pick<Supplement, "id" | "name" | "components">[],
  fromDate: string, // YYYY-MM-DD
): string[] {
  const catalogById = new Map(catalog.map((s) => [s.id, s]));
  const warnedGroups = new Set<string>();
  const warnings: string[] = [];

  for (let offset = 0; offset < SCAN_DAYS; offset++) {
    const date = addDays(fromDate, offset);
    const activeItemsToday = items.filter((it) => frequencyAppliesOn(it.frequency, date));

    // groupKey -> Set de supplementId distintos activos ese día con ese componente
    const bySupplementPerGroup = new Map<string, Set<string>>();
    for (const item of activeItemsToday) {
      const supplement = catalogById.get(item.supplementId);
      if (!supplement) continue;
      const groups = new Set(supplement.components.map((c) => componentGroupKey(c.name)));
      for (const group of groups) {
        // Un nombre 100% entre paréntesis queda con clave vacía: no agrupar productos sin relación.
        if (!group) continue;
        if (!bySupplementPerGroup.has(group)) bySupplementPerGroup.set(group, new Set());
        bySupplementPerGroup.get(group)!.add(item.supplementId);
      }
    }

    for (const [group, supplementIds] of bySupplementPerGroup) {
      if (supplementIds.size < 2 || warnedGroups.has(group)) continue;
      warnedGroups.add(group);
      const productNames = [...supplementIds].map((id) => catalogById.get(id)!.name);
      warnings.push(
        `Varios productos activos aportan "${group}" el mismo día: ${productNames.join(", ")}. Revisá si hay solapamiento.`,
      );
    }
  }

  return warnings;
}
