import { supplementMicros, type TakeForMicros } from "@pulsia/shared";
import type { Meal } from "@pulsia/shared";
import { buildNutritionDaySummary } from "../src/nutrition/daySummary";
import { buildDayNutrientRows } from "../src/nutrition/dayNutrientRows";

// Costura: el backend arma `TakeForMicros[]` (takes + plan + catálogo) y lo pasa por
// `supplementMicros` (shared) para obtener `totals`, que viaja como `supplementNutrients` en el
// summary del día. Este test corre ESE flujo real (no un objeto `supplementNutrients` armado a
// mano) para atar la forma que devuelve `supplementMicros` con lo que consume `buildDayNutrientRows`
// en el diario móvil. Ver `nutrition-ia-micros-status` / `testear-la-costura`.

const persona = { sex: "male" as const, age: 35 };

const meal = (items: any[]): Meal => ({ id: "m", eatenAt: 1, mealType: null, note: null, items } as any);
const item = (o: any) => ({
  id: "i", foodId: null, foodName: "x", quantity: 1, quantityUnit: "g", grams: 100,
  kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, ...o,
});

// Una toma real: un suplemento "Mg+Na" tomado (1 cápsula) que aporta magnesio y algo de sodio.
// Los números se eligen para que las conversiones (sal = sodio × 2,5 / 1000) caigan exactas y no
// dependan de un redondeo ambiguo.
const takes: TakeForMicros[] = [
  {
    status: "taken",
    plannedDose: "1 cápsula",
    actualDose: null,
    supplementName: "Mg+Na",
    components: [
      { name: "Magnesio", amount: 300, unit: "mg", nutrientKey: "magnesium_mg", amountPerUnit: 300 },
      { name: "Sodio", amount: 200, unit: "mg", nutrientKey: "sodium_mg", amountPerUnit: 200 },
    ],
  },
];

test("supplementMicros -> supplementNutrients del summary -> filas del diario (comida + suplemento, % del TOTAL)", () => {
  // 1. El backend calcula el aporte del día con supplementMicros (shared) — NO un total a mano.
  const { totals } = supplementMicros(takes);
  expect(totals.magnesium_mg).toBe(300);
  expect(totals.sodium_mg).toBe(200);

  // 2. El día tiene comida que aporta los MISMOS nutrientes (magnesio y sodio), armada con el
  // mismo buildNutritionDaySummary que usa la app.
  const meals = [meal([item({ magnesium_mg: 50, sodium_mg: 400 })])];
  const summary = buildNutritionDaySummary(meals, []);

  // 3. El hook mergea supplementNutrients en el summary con un spread, igual que useNutritionDay.
  const summaryConSuplementos = { ...summary, supplementNutrients: totals };

  const filas = buildDayNutrientRows(summaryConSuplementos, persona, 2200).flatMap((s) => s.rows);
  const magnesio = filas.find((r) => r.key === "magnesium_mg")!;
  const sal = filas.find((r) => r.key === "salt_g")!;

  // La fila separa comida de suplemento...
  expect(magnesio.value).toBe(50); // solo comida
  expect(magnesio.supplement).toBe(300); // solo suplemento
  // ...pero el % de la referencia (EFSA magnesio, hombre = 350 mg) cuenta el TOTAL: 50+300=350.
  expect(magnesio.ref).toBe(350);
  expect(magnesio.pct).toBe(100);

  // La fila de SAL toma el sodio del suplemento CONVERTIDO (200 mg → 0,5 g), no el mg crudo.
  expect(sal.value).toBe(1); // sodio de comida: 400 mg → 1,0 g
  expect(sal.supplement).toBe(0.5); // sodio de suplemento: 200 mg → 0,5 g
  expect(sal.pct).toBe(30); // (1,0 + 0,5) / 5 * 100 = 30 (referencia OMS de sal)
});
