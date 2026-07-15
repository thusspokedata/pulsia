import { frequencyAppliesOn } from "./checklist";
import type { Frequency, Supplement } from "../schemas/supplements";

const SCAN_DAYS = 14;

// Primera palabra del nombre del componente, minúscula, sin paréntesis:
// "Magnesio (citrato)" y "Magnesio bisglicinato" → "magnesio".
function componentGroupKey(componentName: string): string {
  const withoutParens = componentName.replace(/\([^)]*\)/g, " ");
  const firstWord = withoutParens.trim().split(/\s+/)[0] ?? "";
  return firstWord.toLowerCase();
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Detecta componentes activos que se solapan entre ítems del plan el mismo día.
// Heurística de agrupado: primera palabra del nombre del componente, minúscula, sin paréntesis
// ("Magnesio (citrato)" y "Magnesio bisglicinato" → "magnesio"). Chequea los próximos 14 días
// con frequencyAppliesOn; si algún día 2+ ítems (de PRODUCTOS distintos) comparten componente
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
