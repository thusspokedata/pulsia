import { expect, test } from "bun:test";
import { planSugarClass, type FoodToClassify } from "./backfill-sugar-class";

const f = (id: string, name: string, usdaDescription: string | null = null): FoodToClassify => ({
  id,
  name,
  usdaDescription,
});

test("fruta ENTERA sin descripción USDA → toSet intrinsic", () => {
  const plan = planSugarClass([f("id1", "Manzana")]);
  expect(plan.toSet).toEqual([{ id: "id1", name: "Manzana", sugarClass: "intrinsic" }]);
  expect(plan.unclassified).toHaveLength(0);
});

test("jugo → toSet free", () => {
  const plan = planSugarClass([f("id2", "Jugo de naranja")]);
  expect(plan.toSet).toEqual([{ id: "id2", name: "Jugo de naranja", sugarClass: "free" }]);
  expect(plan.unclassified).toHaveLength(0);
});

test("name genérico + descripción USDA 'Orange juice, raw' → free (usa la descripción)", () => {
  const plan = planSugarClass([f("id3", "Bebida", "Orange juice, raw")]);
  expect(plan.toSet).toEqual([{ id: "id3", name: "Bebida", sugarClass: "free" }]);
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
  expect(plan.toSet.length + plan.unclassified.length).toBe(foods.length);
});
