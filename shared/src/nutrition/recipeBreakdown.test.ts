import { test, expect } from "bun:test";
import { expandRecipe } from "./recipeBreakdown";
import { macroValueOf, nutrientValueOf } from "./breakdown";
import type { MacroSource } from "./macros";
import type { RecipeItemInput } from "../schemas/nutrition";

// Food de ayuda: per_100g, sólo los campos que el test necesita.
const food = (name: string, per100: Partial<MacroSource>): MacroSource & { name: string } =>
  ({ name, basis: "per_100g", kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, unitWeightG: null, ...per100 } as any);

const item = (foodId: string, quantity: number): RecipeItemInput => ({ foodId, quantity, unit: "g" });

test("reparte el aporte por ingrediente, mayor a menor", () => {
  const catalog: Record<string, MacroSource & { name: string }> = {
    carne: food("Carne", { protein_g: 26 }),
    cebolla: food("Cebolla", { protein_g: 1 }),
  };
  const items = [item("carne", 100), item("cebolla", 50)];
  const r = expandRecipe(items, (id) => catalog[id] ?? null, macroValueOf("protein_g"));
  expect(r.complete).toBe(true);
  // Carne: 26 g · Cebolla: 0.5 g
  expect(r.contributions.map((c) => [c.name, Math.round(c.value * 10) / 10])).toEqual([
    ["Carne", 26],
    ["Cebolla", 0.5],
  ]);
});

test("complete=false si un ingrediente no resuelve, pero computa los demás", () => {
  const catalog: Record<string, MacroSource & { name: string }> = { carne: food("Carne", { protein_g: 26 }) };
  const items = [item("carne", 100), item("desaparecida", 50)];
  const r = expandRecipe(items, (id) => catalog[id] ?? null, macroValueOf("protein_g"));
  expect(r.complete).toBe(false);
  expect(r.contributions.map((c) => c.name)).toEqual(["Carne"]);
});

test("descarta ingredientes con aporte null o 0", () => {
  const catalog: Record<string, MacroSource & { name: string }> = {
    carne: food("Carne", { protein_g: 26 }),
    agua: food("Agua", { protein_g: 0 }),
  };
  const items = [item("carne", 100), item("agua", 200)];
  const r = expandRecipe(items, (id) => catalog[id] ?? null, macroValueOf("protein_g"));
  expect(r.contributions.map((c) => c.name)).toEqual(["Carne"]);
});

test("salt_g reparte por sodio", () => {
  const catalog: Record<string, MacroSource & { name: string }> = {
    salsa: food("Salsa", { sodium_mg: 400 }),
    pasta: food("Pasta", { sodium_mg: 40 }),
  };
  const items = [item("salsa", 100), item("pasta", 100)];
  const r = expandRecipe(items, (id) => catalog[id] ?? null, nutrientValueOf("salt_g"));
  expect(r.contributions.map((c) => c.name)).toEqual(["Salsa", "Pasta"]);
  // saltGFromSodiumMg(400)=1.0 g, saltGFromSodiumMg(40)=0.1 g (saltGFromSodiumMg redondea a 1 decimal)
  expect(r.contributions[0].value).toBeCloseTo(1.0, 3);
});

test("Σ=0 → sin contribuciones", () => {
  const catalog: Record<string, MacroSource & { name: string }> = { agua: food("Agua", { protein_g: 0 }) };
  const r = expandRecipe([item("agua", 100)], (id) => catalog[id] ?? null, macroValueOf("protein_g"));
  expect(r.contributions).toEqual([]);
});

test("un ingrediente con unidad incoherente con su basis (foodMacrosRaw lanza) marca complete=false y no aparece, pero los demás sí", () => {
  const catalog: Record<string, MacroSource & { name: string }> = {
    carne: food("Carne", { protein_g: 26 }),
    // Food per_100ml, pero item() pide unit "g" → foodMacrosRaw lanza (guard unidad/basis). El catch
    // amplio lo trata como faltante: no aporta a contributions y marca la expansión incompleta.
    leche: food("Leche", { basis: "per_100ml", protein_g: 3 }),
  };
  const items = [item("carne", 100), item("leche", 100)]; // item() usa unit: "g"
  const r = expandRecipe(items, (id) => catalog[id] ?? null, macroValueOf("protein_g"));
  expect(r.complete).toBe(false);
  expect(r.contributions.map((c) => c.name)).toEqual(["Carne"]);
});

test("aplana un solo nivel: un ingrediente que a su vez es una receta se usa como átomo (su per-100g), sin recursión", () => {
  const catalog: Record<string, MacroSource & { name: string }> = {
    // Este Food ES una receta (trae .recipe con sub-ingredientes), pero acá se usa su per-100g
    // compuesto tal cual: aparece como UNA contribución con su propio nombre, no expandido.
    salsa: {
      ...food("Salsa boloñesa", { protein_g: 8 }),
      recipe: { items: [item("carne", 50), item("cebolla", 50)], cookedWeightG: null },
    } as any,
  };
  const r = expandRecipe([item("salsa", 100)], (id) => catalog[id] ?? null, macroValueOf("protein_g"));
  expect(r.contributions).toHaveLength(1);
  expect(r.contributions[0].name).toBe("Salsa boloñesa");
  expect(r.contributions[0].value).toBeCloseTo(8, 5); // 8 g/100g × 100 g, sin recursar a sub-ingredientes
});

test("descarta un ingrediente cuyo nutriente elegido es null (ausente), distinto de 0", () => {
  const catalog: Record<string, MacroSource & { name: string }> = {
    queso: food("Queso", { calcium_mg: 700 }),
    // Sin calcium → foodMacrosRaw lo escala a null (ausente), NO a 0 → se descarta como faltante.
    aceite: food("Aceite", {}),
  };
  const items = [item("queso", 100), item("aceite", 20)];
  const r = expandRecipe(items, (id) => catalog[id] ?? null, nutrientValueOf("calcium_mg"));
  expect(r.complete).toBe(true); // ambos resolvieron; el aceite simplemente no aporta el micro
  expect(r.contributions.map((c) => c.name)).toEqual(["Queso"]);
});

test("un ingrediente con cookingYield se computa SIN dividir por el yield (coherente con weighedCooked:false, igual que deriveRecipe)", () => {
  // deriveRecipe construye el per-100g de la receta con { weighedCooked: false }: el per-100g SECO
  // del ingrediente se aplica tal cual. expandRecipe tiene que repartir con la MISMA semántica, o las
  // fracciones no coinciden con cómo se derivó la receta.
  const catalog: Record<string, MacroSource & { name: string }> = {
    arroz: food("Arroz seco", { protein_g: 26, cookingYield: 2.5 }),
  };
  const r = expandRecipe([item("arroz", 100)], (id) => catalog[id] ?? null, macroValueOf("protein_g"));
  // weighedCooked:false → factor 1.0 → 26 g/100g × 100 g = 26 g.
  // (Con el bug —weighedCooked default true— se dividiría por 2.5 → 10.4 g.)
  expect(r.contributions).toHaveLength(1);
  expect(r.contributions[0].value).toBeCloseTo(26, 5);
});
