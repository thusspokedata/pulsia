import { dailyNutrientSeries } from "../src/nutrition/nutrientSeries";
import { saltGFromSodiumMg } from "@pulsia/shared";
import { dateKey } from "../src/session/dateKey";
import type { Meal } from "@pulsia/shared";

// Julio 2026, hora local. El mes es 0-indexado en Date.
const at = (day: number, hour: number) => new Date(2026, 6, day, hour).getTime();
const noon = (day: number) => new Date(2026, 6, day, 12).getTime();
// El fold de suplementos se indexa por dateKey (día local), la misma clave que usa el motor.
const dayKey = (day: number) => dateKey(noon(day));

const meal = (eatenAt: number, cholesterols: (number | null)[]): Meal =>
  ({
    id: "m",
    eatenAt,
    mealType: null,
    note: null,
    items: cholesterols.map((cholesterol_mg) => ({
      foodName: "x", grams: 100, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
      cholesterol_mg, sugars_g: null, fiber_g: null, saturated_fat_g: null, sodium_mg: null, water_ml: null,
    })),
  }) as any;

// Igual que `meal`, pero cargando SODIO: es lo que el ítem guarda cuando la curva pedida es la
// de sal.
const mealConSodio = (eatenAt: number, sodios: (number | null)[]): Meal =>
  ({
    id: "m", eatenAt, mealType: null, note: null,
    items: sodios.map((sodium_mg) => ({
      foodName: "x", grams: 100, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
      sodium_mg, cholesterol_mg: null, sugars_g: null, fiber_g: null, saturated_fat_g: null, water_ml: null,
    })),
  }) as any;

test("un punto por día, anclado al MEDIODÍA local (no a la hora de la comida)", () => {
  const { points } = dailyNutrientSeries([meal(at(10, 8), [100])], "cholesterol_mg");
  expect(points).toEqual([{ x: noon(10), y: 100 }]);
});

test("varias comidas del mismo día se suman en un solo punto", () => {
  // Desayuno 8am y cena 22pm del día 10: un punto, no dos.
  const meals = [meal(at(10, 8), [100]), meal(at(10, 22), [50])];
  expect(dailyNutrientSeries(meals, "cholesterol_mg").points).toEqual([{ x: noon(10), y: 150 }]);
});

test("los puntos salen ordenados por fecha, no por orden de llegada", () => {
  const meals = [meal(at(12, 8), [30]), meal(at(10, 8), [10]), meal(at(11, 8), [20])];
  expect(dailyNutrientSeries(meals, "cholesterol_mg").points.map((p) => p.y)).toEqual([10, 20, 30]);
});

test("un día SIN el dato no genera punto (no es lo mismo 'comí 0' que 'no sé')", () => {
  const meals = [meal(at(10, 8), [100]), meal(at(11, 8), [null])];
  const { points } = dailyNutrientSeries(meals, "cholesterol_mg");
  expect(points).toEqual([{ x: noon(10), y: 100 }]);
});

test("un día con el dato en 0 SÍ genera punto (es información real)", () => {
  const meals = [meal(at(10, 8), [100]), meal(at(11, 8), [0])];
  expect(dailyNutrientSeries(meals, "cholesterol_mg").points.map((p) => p.y)).toEqual([100, 0]);
});

test("un día mixto (un ítem con dato, otro sin) suma tratando el null como 0", () => {
  // Mismo criterio que sumNullableMicro y que el total del día en la pestaña Nutrientes.
  expect(dailyNutrientSeries([meal(at(10, 8), [100, null])], "cholesterol_mg").points).toEqual([
    { x: noon(10), y: 100 },
  ]);
});

test("el promedio es sobre los días CON registro, no sobre el rango", () => {
  // 3 días registrados de un rango que podría ser de 30: 300/3 = 100, no 300/30.
  const meals = [meal(at(10, 8), [50]), meal(at(11, 8), [100]), meal(at(12, 8), [150])];
  expect(dailyNutrientSeries(meals, "cholesterol_mg").average).toBe(100);
});

test("la curva de sal se dibuja en gramos de SAL, derivados del sodio del ítem", () => {
  // El ítem guarda sodio; la pantalla (y su línea de referencia OMS de 5 g) hablan en sal.
  // 400 mg de sodio = 1 g de sal.
  const { points } = dailyNutrientSeries([mealConSodio(at(10, 8), [400])], "salt_g");
  expect(points).toEqual([{ x: noon(10), y: 1 }]);
});

test("la sal del día convierte el sodio SUMADO, no ítem por ítem", () => {
  // 50 + 50 mg → 100 mg → 0,25 → 0,3 g. Convertir cada ítem y sumar daría 0,2 g.
  const { points } = dailyNutrientSeries([mealConSodio(at(10, 8), [50, 50])], "salt_g");
  expect(points.map((p) => p.y)).toEqual([0.3]);
});

test("un día sin sodio en ningún ítem no genera punto de sal", () => {
  expect(dailyNutrientSeries([mealConSodio(at(10, 8), [null])], "salt_g").points).toEqual([]);
});

test("sin comidas, o sin ningún dato del nutriente: sin puntos y promedio null", () => {
  expect(dailyNutrientSeries([], "cholesterol_mg")).toEqual({ points: [], average: null });
  expect(dailyNutrientSeries([meal(at(10, 8), [null])], "cholesterol_mg")).toEqual({ points: [], average: null });
});

// ── Fold del aporte de suplementos (NUT-15) ────────────────────────────────────────────────────

test("NUT-15: cada punto suma comida + suplemento del día, y el promedio sube respecto a food-only", () => {
  const meals = [meal(at(10, 8), [100]), meal(at(11, 8), [200])];
  const supp = { [dayKey(10)]: 50, [dayKey(11)]: 100 };
  // food-only: 100 y 200 (promedio 150). Con suplemento: 150 y 300 (promedio 225).
  expect(dailyNutrientSeries(meals, "cholesterol_mg").average).toBe(150);
  const { points, average } = dailyNutrientSeries(meals, "cholesterol_mg", supp);
  expect(points).toEqual([{ x: noon(10), y: 150 }, { x: noon(11), y: 300 }]);
  expect(average).toBe(225);
});

test("NUT-15: un día SOLO-suplemento (sin comida ese día) genera punto y cuenta para el promedio", () => {
  const meals = [meal(at(10, 8), [100])];
  const supp = { [dayKey(11)]: 40 }; // el día 11 no tiene comida
  const { points, average } = dailyNutrientSeries(meals, "cholesterol_mg", supp);
  expect(points).toEqual([{ x: noon(10), y: 100 }, { x: noon(11), y: 40 }]);
  expect(average).toBe(70); // (100 + 40) / 2, no 100/1
});

test("NUT-15: un nutriente que viene casi todo del suplemento no queda plano/bajo (caso vitamina D)", () => {
  // La comida aporta trazas; la pastilla, el grueso. Sin el fold la curva quedaba en ~0,5 (plana).
  const meals = [meal(at(10, 8), [0.5]), meal(at(11, 8), [0.5]), meal(at(12, 8), [0.5])];
  const supp = { [dayKey(10)]: 20, [dayKey(11)]: 20, [dayKey(12)]: 20 };
  const { points, average } = dailyNutrientSeries(meals, "cholesterol_mg", supp);
  expect(points.map((p) => p.y)).toEqual([20.5, 20.5, 20.5]);
  expect(average).toBe(20.5); // food-only daría 0,5
});

test("NUT-15: para salt_g el suplemento viene en SODIO, se suma al sodio de comida y recién ahí se convierte a sal", () => {
  const meals = [mealConSodio(at(10, 8), [200])];
  const supp = { [dayKey(10)]: 200 }; // sodio del suplemento
  const { points } = dailyNutrientSeries(meals, "salt_g", supp);
  // 200 + 200 = 400 mg de sodio → 1,0 g de sal. Convertir cada fuente y sumar daría 0,5 + 0,5 = 1,0
  // acá por casualidad, así que se elige un total que lo distingue en el número exacto del helper.
  expect(points).toEqual([{ x: noon(10), y: saltGFromSodiumMg(400) }]);
  expect(points[0].y).toBe(1);
});

test("NUT-15: la sal suma el sodio ANTES de convertir (el redondeo por-fuente daría otro número)", () => {
  const meals = [mealConSodio(at(10, 8), [50])];
  const supp = { [dayKey(10)]: 50 };
  // 50 + 50 = 100 mg → 0,25 → 0,3 g. Convertir cada fuente: saltGFromSodiumMg(50)=0,1 ×2 = 0,2 g.
  expect(dailyNutrientSeries(meals, "salt_g", supp).points.map((p) => p.y)).toEqual([0.3]);
});

test("NUT-15: sin el tercer argumento el resultado es idéntico al comportamiento anterior", () => {
  const meals = [meal(at(10, 8), [50]), meal(at(11, 8), [100]), meal(at(12, 8), [150])];
  expect(dailyNutrientSeries(meals, "cholesterol_mg")).toEqual(
    dailyNutrientSeries(meals, "cholesterol_mg", undefined),
  );
  expect(dailyNutrientSeries(meals, "cholesterol_mg", undefined).points.map((p) => p.y)).toEqual([50, 100, 150]);
});

test("NUT-15: un día sin comida y con el aporte de suplemento nulo NO genera punto", () => {
  const meals = [meal(at(10, 8), [100])];
  const supp = { [dayKey(11)]: null, [dayKey(12)]: undefined };
  expect(dailyNutrientSeries(meals, "cholesterol_mg", supp).points).toEqual([{ x: noon(10), y: 100 }]);
});
