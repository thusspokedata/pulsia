import { useEffect, useState } from "react";
import { getBackendUrl } from "../storage/config";
import { listFoods } from "../api/nutrition";
import type { Food } from "@pulsia/shared";

// Baja el catálogo entero una vez y lo indexa por id. Lo usan las pantallas de ranking para resolver
// los ingredientes de una receta (NUT-16). Degradación limpia: si falla, devuelve un Map vacío —
// ninguna fila será expandible, pero la pantalla sigue funcionando con los rankings.
export function useFoodCatalog(): Map<string, Food> {
  const [byId, setById] = useState<Map<string, Food>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await getBackendUrl();
        const foods = await listFoods(url);
        if (cancelled) return;
        setById(new Map(foods.map((f) => [f.id, f])));
      } catch {
        if (!cancelled) setById(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return byId;
}
