import { buildNutritionDaySummary } from "../src/nutrition/daySummary";
import { buildDayNutrientRows } from "../src/nutrition/dayNutrientRows";
import type { Meal } from "@pulsia/shared";

const persona = { sex: "male" as const, age: 35 };

const meal = (items: any[]): Meal => ({ id: "m", eatenAt: 1, mealType: null, note: null, items } as any);
const item = (o: any) => ({
  id: "i", foodId: null, foodName: "x", quantity: 1, quantityUnit: "g", grams: 100,
  kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, ...o,
});

// El día se arma con el MISMO buildNutritionDaySummary que usa la app, no con un summary a mano:
// la costura entre la suma del día y las filas es justamente donde esto se puede romper.
const dia = (items: any[]) => buildNutritionDaySummary([meal(items)], []);
const filasDe = (items: any[], goalKcal: number | null = 2200) =>
  buildDayNutrientRows(dia(items), persona, goalKcal).flatMap((s) => s.rows);
const fila = (items: any[], key: string, goalKcal: number | null = 2200) =>
  filasDe(items, goalKcal).find((r) => r.key === key)!;

// ---------------------------------------------------------------------------------------------
// Las 5 referencias OMS que la pestaña ya mostraba. Están en `null` en la tabla EFSA a propósito
// (para no mostrar dos referencias del mismo nutriente), así que al unificar en NutrientList es
// exactamente acá donde se pierden en silencio.
// ---------------------------------------------------------------------------------------------

test("azúcares conserva la referencia OMS de 50 g como LÍMITE", () => {
  const f = fila([item({ sugars_g: 40 })], "sugars_g");
  expect(f.value).toBe(40);
  expect(f.ref).toBe(50);
  expect(f.kind).toBe("max");
  expect(f.pct).toBe(80);
});

test("fibra conserva la referencia OMS de 30 g y sigue siendo un PISO", () => {
  const f = fila([item({ fiber_g: 22 })], "fiber_g");
  expect(f.value).toBe(22);
  expect(f.ref).toBe(30);
  expect(f.kind).toBe("min"); // pasarse de la fibra es BUENO: nunca avisa
});

test("colesterol conserva la referencia de 300 mg como LÍMITE", () => {
  const f = fila([item({ cholesterol_mg: 210 })], "cholesterol_mg");
  expect(f.value).toBe(210);
  expect(f.ref).toBe(300);
  expect(f.kind).toBe("max");
});

test("saturadas se acotan al 10% de la ENERGÍA, no a gramos fijos", () => {
  // 2200 kcal → 220 kcal de saturadas → 24,4 g. Con otra meta de kcal la referencia CAMBIA: un
  // test con una sola meta pasaría igual con un número fijo hardcodeado.
  expect(fila([item({ saturated_fat_g: 18 })], "saturated_fat_g", 2200).ref).toBe(24.4);
  expect(fila([item({ saturated_fat_g: 18 })], "saturated_fat_g", 1800).ref).toBe(20);
  expect(fila([item({ saturated_fat_g: 18 })], "saturated_fat_g", 2200).kind).toBe("max");
});

test("sin meta de kcal, saturadas se muestra SIN referencia (no hereda ninguna otra)", () => {
  const f = fila([item({ saturated_fat_g: 18 })], "saturated_fat_g", null);
  expect(f.value).toBe(18);
  expect(f.ref).toBeNull();
  expect(f.pct).toBeNull();
});

test("la sal conserva la referencia OMS de 5 g y se deriva del sodio del día", () => {
  // 1600 mg de sodio = 4 g de sal. El ítem guarda SODIO; la fila habla en SAL, que es la unidad
  // que el usuario lee en el resto de la app.
  const f = fila([item({ sodium_mg: 1600 })], "salt_g");
  expect(f.value).toBe(4);
  expect(f.unit).toBe("g");
  expect(f.ref).toBe(5);
  expect(f.kind).toBe("max");
  expect(f.pct).toBe(80);
});

test("la fila de sal REEMPLAZA a la de sodio: el mismo dato no se muestra dos veces", () => {
  const keys = filasDe([item({ sodium_mg: 1600 })]).map((r) => r.key);
  expect(keys).toContain("salt_g");
  expect(keys).not.toContain("sodium_mg");
});

test("la sal vive en Minerales, donde estaba el sodio", () => {
  const secciones = buildDayNutrientRows(dia([item({ sodium_mg: 1600 })]), persona, 2200);
  const minerales = secciones.find((s) => s.group === "minerales")!;
  expect(minerales.rows.map((r) => r.key)).toContain("salt_g");
});

test("sin sodio en ningún ítem, la sal es 'sin dato', no 0", () => {
  const f = fila([item({})], "salt_g");
  expect(f.value).toBeNull();
  expect(f.pct).toBeNull();
});

// ---------------------------------------------------------------------------------------------
// Lo que la unificación agrega
// ---------------------------------------------------------------------------------------------

test("además de las 5, ahora aparecen vitaminas y minerales con su referencia EFSA", () => {
  const f = fila([item({ iron_mg: 5.5 })], "iron_mg");
  expect(f.value).toBe(5.5);
  expect(f.ref).toBe(11); // varón adulto
  expect(f.kind).toBe("min");
  expect(f.pct).toBe(50);
});

test("la referencia EFSA del día está personalizada por sexo", () => {
  const s = dia([item({ iron_mg: 5.5 })]);
  const refDe = (p: { sex: string; age: number }) =>
    buildDayNutrientRows(s, p, 2200).flatMap((x) => x.rows).find((r) => r.key === "iron_mg")!.ref;
  expect(refDe({ sex: "male", age: 35 })).toBe(11);
  expect(refDe({ sex: "female", age: 35 })).toBe(16);
});

test("el día muestra los 33 nutrientes, no 5", () => {
  // 33 = las 30 originales + trans_fat_g/monounsaturated_fat_g/polyunsaturated_fat_g (NUT-14).
  const keys = filasDe([item({})]).map((r) => r.key);
  expect(keys.length).toBe(33);
  expect(new Set(keys).size).toBe(33);
  for (const k of ["zinc_mg", "vitamin_c_mg", "omega3_g", "water_ml"]) expect(keys).toContain(k);
});

test("el agua de la fila es el LÍQUIDO TOTAL del día, no solo el que aportan los alimentos", () => {
  // La referencia EFSA (2,5 L en un varón) es de agua TOTAL. Con solo el agua de los alimentos,
  // un día de 2,1 L se mostraría como 300 ml: un 12% de la referencia en vez de un 84%.
  const s = buildNutritionDaySummary(
    [meal([item({ water_ml: 300 })])],
    [{ id: "w", ml: 1800, loggedAt: 1 }],
  );
  const f = buildDayNutrientRows(s, persona, 2200).flatMap((x) => x.rows).find((r) => r.key === "water_ml")!;
  expect(f.value).toBe(2100);
  expect(f.ref).toBe(2500);
});

test("un día sin líquido de ningún tipo no muestra 0 ml: no hay dato", () => {
  expect(fila([item({})], "water_ml").value).toBeNull();
});

test("líquido bebido sin alimentos que declaren agua igual cuenta", () => {
  const s = buildNutritionDaySummary([meal([item({})])], [{ id: "w", ml: 500, loggedAt: 1 }]);
  const f = buildDayNutrientRows(s, persona, 2200).flatMap((x) => x.rows).find((r) => r.key === "water_ml")!;
  expect(f.value).toBe(500);
});

// ---------------------------------------------------------------------------------------------
// La marca de parcial
// ---------------------------------------------------------------------------------------------

test("un ítem con zinc y otro sin zinc: la fila de zinc sale PARCIAL", () => {
  const f = fila([item({ zinc_mg: 0.8 }), item({})], "zinc_mg");
  expect(f.value).toBe(0.8);
  expect(f.partial).toBe(true);
});

test("si todos los ítems declaran el zinc, la fila NO sale parcial", () => {
  const f = fila([item({ zinc_mg: 0.8 }), item({ zinc_mg: 0.2 })], "zinc_mg");
  expect(f.partial).toBe(false);
});

test("la fila de sal hereda el parcial del sodio", () => {
  expect(fila([item({ sodium_mg: 1600 }), item({})], "salt_g").partial).toBe(true);
  expect(fila([item({ sodium_mg: 1600 }), item({ sodium_mg: 400 })], "salt_g").partial).toBe(false);
});

test("un día vacío no rompe: todas las filas sin dato y sin porcentaje", () => {
  const filas = buildDayNutrientRows(buildNutritionDaySummary([], []), persona, 2200).flatMap((s) => s.rows);
  expect(filas.length).toBe(33);
  expect(filas.every((r) => r.value === null && r.pct === null)).toBe(true);
});

// ---------------------------------------------------------------------------------------------
// Aporte de suplementos (Task 12): la fila del día muestra comida + suplemento por separado.
// ---------------------------------------------------------------------------------------------

test("una fila refleja el aporte de suplemento cuando summary.supplementNutrients lo trae", () => {
  const summary = { ...dia([item({ magnesium_mg: 50 })]), supplementNutrients: { magnesium_mg: 100 } };
  const f = buildDayNutrientRows(summary, persona, 2200).flatMap((s) => s.rows).find((r) => r.key === "magnesium_mg")!;
  expect(f.value).toBe(50);
  expect(f.supplement).toBe(100);
});

test("una fila sin aporte de suplemento en el mapa queda en supplement: null", () => {
  const summary = { ...dia([item({ magnesium_mg: 50 })]), supplementNutrients: { iron_mg: 5 } };
  const f = buildDayNutrientRows(summary, persona, 2200).flatMap((s) => s.rows).find((r) => r.key === "magnesium_mg")!;
  expect(f.supplement).toBeNull();
});

test("la fila de sal toma el sodio de suplemento convertido a sal", () => {
  // 800 mg de sodio de suplemento = 2 g de sal.
  const summary = { ...dia([item({ sodium_mg: 1600 })]), supplementNutrients: { sodium_mg: 800 } };
  const f = buildDayNutrientRows(summary, persona, 2200).flatMap((s) => s.rows).find((r) => r.key === "salt_g")!;
  expect(f.value).toBe(4); // sal de la comida, sin cambios
  expect(f.supplement).toBe(2);
});

test("sin sodio de suplemento, la fila de sal queda con supplement: null", () => {
  const f = fila([item({ sodium_mg: 1600 })], "salt_g");
  expect(f.supplement).toBeNull();
});

// ---------------------------------------------------------------------------------------------
// Fix 1: un día SIN comida pero con suplemento tomado no puede quedar en "sin dato". El total
// consumido es (value ?? 0) + (supplement ?? 0), y el pct se calcula sobre eso, no solo la comida.
// ---------------------------------------------------------------------------------------------

test("un día sin comida pero con suplemento: el pct se calcula sobre el suplemento (Fix 1)", () => {
  const summary = { ...buildNutritionDaySummary([], []), supplementNutrients: { magnesium_mg: 300 } };
  const f = buildDayNutrientRows(summary, persona, 2200).flatMap((s) => s.rows).find((r) => r.key === "magnesium_mg")!;
  expect(f.value).toBeNull(); // sigue sin comida
  expect(f.supplement).toBe(300);
  expect(f.pct).not.toBeNull();
});

test("sal: un día sin sodio de comida pero con sodio de suplemento también calcula pct (Fix 1)", () => {
  const summary = { ...buildNutritionDaySummary([], []), supplementNutrients: { sodium_mg: 800 } };
  const f = buildDayNutrientRows(summary, persona, 2200).flatMap((s) => s.rows).find((r) => r.key === "salt_g")!;
  expect(f.value).toBeNull();
  expect(f.supplement).toBe(2); // 800 mg de sodio = 2 g de sal
  expect(f.pct).not.toBeNull();
});
