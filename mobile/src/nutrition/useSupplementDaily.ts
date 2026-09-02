import { useEffect, useState } from "react";
import type { RankNutrient } from "@pulsia/shared";
import { getRangeNutrientsDaily } from "../api/supplements";
import { getBackendUrl } from "../storage/config";
import { dayBounds } from "./dayBounds";
import { dateKey } from "../session/dateKey";

// El aporte de suplementos POR DÍA, en unidad FUENTE, para foldear en la curva "Evolución" (ver
// dailyNutrientSeries). Mismo rango y misma `backendKey` que useSupplementRanks (para la sal se
// pide "sodium_mg": el fold convierte a sal sobre el sodio ya sumado con la comida). Sin esto la
// curva era food-only y contradecía la lista "De mayor a menor aporte", que sí suma el suplemento.
//
// Guard por query-key: guardamos junto al resultado la clave de la consulta que lo produjo
// (`days|offset|nutrient`) y, mientras la request de la consulta ACTUAL no resuelve, devolvemos {}
// en vez del resultado de la consulta anterior. Sin esto, al cambiar de nutriente o de rango la
// curva combinaría las comidas actuales con los suplementos de la consulta previa por el instante
// que tarda la nueva request (p.ej. pasar de vitamina D a sodio sumaría la D vieja al sodio). El
// `cancelled` evita que una request vieja que resuelve tarde pise a una nueva; el guard cubre el
// hueco inverso: la nueva todavía no resolvió y la vieja ya no corresponde.
// Misma degradación limpia (try/catch → {}) que useSupplementRanks.
export function useSupplementDaily(
  days: number,
  offset: number,
  nutrient: RankNutrient,
): Record<string, number | undefined> {
  const key = `${days}|${offset}|${nutrient}`;
  const [state, setState] = useState<{ key: string; byDay: Record<string, number | undefined> }>({
    key: "",
    byDay: {},
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await getBackendUrl();
        const from = dateKey(dayBounds(offset + days - 1).noon);
        const to = dateKey(dayBounds(offset).noon);
        const { perDay } = await getRangeNutrientsDaily(url, from, to);
        const backendKey = nutrient === "salt_g" ? "sodium_mg" : nutrient;
        const next: Record<string, number | undefined> = {};
        for (const [dayKey, sn] of Object.entries(perDay)) {
          next[dayKey] = sn.totals[backendKey];
        }
        // La clave se recompone acá (no se captura la de fuera) para no arrastrar deps al efecto.
        if (!cancelled) setState({ key: `${days}|${offset}|${nutrient}`, byDay: next });
      } catch {
        if (!cancelled) setState({ key: `${days}|${offset}|${nutrient}`, byDay: {} });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days, offset, nutrient]);

  // Solo devolvemos el resultado si corresponde a la consulta actual; si no, {} (nunca combinamos
  // los suplementos de una consulta previa con las comidas actuales).
  return state.key === key ? state.byDay : {};
}
