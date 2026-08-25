import { expect, test } from "bun:test";
import type { SugarClass } from "@pulsia/shared";
import { planSugarClass, type FoodToClassify } from "./backfill-sugar-class";

const f = (
  id: string,
  name: string,
  usdaDescription: string | null = null,
  current: SugarClass | null = null,
): FoodToClassify => ({
  id,
  name,
  usdaDescription,
  current,
});

test("fruta ENTERA sin descripción USDA → toSet intrinsic (from null)", () => {
  const plan = planSugarClass([f("id1", "Manzana")]);
  expect(plan.toSet).toEqual([
    { id: "id1", name: "Manzana", sugarClass: "intrinsic", from: null },
  ]);
  expect(plan.unclassified).toHaveLength(0);
});

test("jugo → toSet free", () => {
  const plan = planSugarClass([f("id2", "Jugo de naranja")]);
  expect(plan.toSet).toEqual([
    { id: "id2", name: "Jugo de naranja", sugarClass: "free", from: null },
  ]);
  expect(plan.unclassified).toHaveLength(0);
});

test("name genérico + descripción USDA 'Orange juice, raw' → free (usa la descripción)", () => {
  const plan = planSugarClass([f("id3", "Bebida", "Orange juice, raw")]);
  expect(plan.toSet).toEqual([{ id: "id3", name: "Bebida", sugarClass: "free", from: null }]);
  expect(plan.unclassified).toHaveLength(0);
});

test("alimento sin pistas de azúcar → unclassified (queda en NULL, conservador)", () => {
  const plan = planSugarClass([f("id4", "Pollo")]);
  expect(plan.toSet).toHaveLength(0);
  expect(plan.unclassified.map((x) => x.name)).toEqual(["Pollo"]);
});

// Idempotencia conceptual: planSugarClass sólo recibe los food con sugar_class IS NULL (lo garantiza
// el WHERE de la query en main()). Acá documentamos que, dada esa entrada, cada food va a EXACTAMENTE
// uno de los dos buckets — nunca se re-clasifica algo ya seteado porque nunca llega acá.
test("cada food entra a exactamente un bucket (toSet ∪ unclassified, sin solapar)", () => {
  const foods = [f("a", "Manzana"), f("b", "Jugo de naranja"), f("c", "Pollo")];
  const plan = planSugarClass(foods);
  expect(plan.toSet.length + plan.unclassified.length + plan.unchanged.length).toBe(foods.length);
  expect(plan.unchanged).toHaveLength(0); // en modo normal (current=null) nada queda "igual"
});

// --- Modo --reclassify: re-evaluar filas YA clasificadas y CORREGIR sólo si el clasificador difiere ---

test("reclassify: current='intrinsic' cuyo nombre ahora clasifica free → CORREGIR (toSet, from intrinsic)", () => {
  // Caso real: "Torta de manzana con streusel" quedó intrinsic (pescaba "manzana") escondiendo la
  // azúcar agregada; con "torta"/"streusel" en free, el clasificador ahora da free → se corrige.
  const plan = planSugarClass([f("id1", "Torta de manzana con streusel", null, "intrinsic")]);
  expect(plan.toSet).toEqual([
    { id: "id1", name: "Torta de manzana con streusel", sugarClass: "free", from: "intrinsic" },
  ]);
  expect(plan.unchanged).toHaveLength(0);
  expect(plan.unclassified).toHaveLength(0);
});

test("reclassify: current='intrinsic' que sigue intrinsic → NO se toca (unchanged, no re-escribe)", () => {
  const plan = planSugarClass([f("id2", "Manzana", null, "intrinsic")]);
  expect(plan.toSet).toHaveLength(0);
  expect(plan.unchanged.map((x) => x.name)).toEqual(["Manzana"]);
});

test("reclassify: current='free' que el clasificador da null → NO se toca (no la borra)", () => {
  // El clasificador no sabe (null) pero la fila ya tenía 'free' (quizá de la IA con etiqueta): se
  // DEJA como está, nunca la degradamos a NULL.
  const plan = planSugarClass([f("id3", "Postre misterioso", null, "free")]);
  expect(plan.toSet).toHaveLength(0);
  expect(plan.unchanged).toHaveLength(0);
  expect(plan.unclassified.map((x) => x.name)).toEqual(["Postre misterioso"]);
});

test("idempotencia de reclassify: correr sobre el resultado ya corregido no cambia nada", () => {
  // Tras corregir a 'free', volver a evaluar con current='free' → unchanged (no re-escribe).
  const plan = planSugarClass([f("id1", "Torta de manzana con streusel", null, "free")]);
  expect(plan.toSet).toHaveLength(0);
  expect(plan.unchanged).toHaveLength(1);
});
