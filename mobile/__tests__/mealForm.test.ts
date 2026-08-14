import { buildMealInput, itemPreview, mealTotals, allowedUnits, hhmmFromMs, combineDayAndTime } from "../src/nutrition/mealForm";

// Los alimentos ya no guardan sal sino SODIO (factor 2,5: 0,1 g de sal = 40 mg de sodio). Las
// aserciones de los tests siguen hablando en sal, que es lo que la app muestra.
const banana = { id: "f1", name: "Banana", basis: "per_100g" as const, kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, unitWeightG: 120, sourceMacros: "ai" as const, sourceMicros: "usda" as const, createdAt: 0, saturated_fat_g: 0.1, sugars_g: 12, fiber_g: 2.6, sodium_mg: 0, cholesterol_mg: 0, water_ml: 75 };
const leche = { id: "f2", name: "Leche", basis: "per_100ml" as const, kcal: 42, protein_g: 3.4, carbs_g: 5, fat_g: 1, unitWeightG: null, sourceMacros: "label" as const, sourceMicros: null, createdAt: 0, saturated_fat_g: 0.6, sugars_g: 5, fiber_g: null, sodium_mg: 40, cholesterol_mg: 10, water_ml: 88 };

test("allowedUnits: sólido con unitWeightG → g + unit", () => {
  expect(allowedUnits(banana)).toEqual(["g", "unit"]);
});

test("allowedUnits: líquido sin unitWeightG → ml", () => {
  expect(allowedUnits(leche)).toEqual(["ml"]);
});

test("itemPreview escala los macros del ítem", () => {
  expect(itemPreview(banana, 1, "unit")).toMatchObject({ grams: 120, kcal: 107 });
});

test("buildMealInput arma el payload con eatenAt y tipo", () => {
  const input = buildMealInput({
    eatenAt: 123, mealType: "desayuno", note: "",
    rows: [{ food: banana, quantity: 1, unit: "unit" }, { food: leche, quantity: 200, unit: "ml" }],
  });
  expect(input.eatenAt).toBe(123);
  expect(input.mealType).toBe("desayuno");
  expect(input.note).toBeNull(); // "" → null
  expect(input.items).toEqual([
    { foodId: "f1", quantity: 1, quantityUnit: "unit" },
    { foodId: "f2", quantity: 200, quantityUnit: "ml" },
  ]);
});

test("mealTotals suma kcal y macros de todos los ítems", () => {
  const t = mealTotals([{ food: banana, quantity: 1, unit: "unit" }, { food: leche, quantity: 200, unit: "ml" }]);
  expect(t.kcal).toBe(107 + 84);
  expect(t.protein_g).toBeCloseTo(1.3 + 6.8, 1);
});

test("mealTotals suma los micros (null-safe)", () => {
  const t = mealTotals([{ food: banana, quantity: 1, unit: "unit" }, { food: leche, quantity: 200, unit: "ml" }]);
  // banana 1u=120g: sugars 14.4, sat 0.1, fiber 3.1, sodio 0 ; leche 200ml: sugars 10, sat 1.2, fiber null, sodio 80 mg
  expect(t.sugars_g).toBeCloseTo(24.4, 1);
  expect(t.saturated_fat_g).toBeCloseTo(1.3, 1);
  expect(t.fiber_g).toBeCloseTo(3.1, 1); // leche fiber null → cuenta como 0, pero banana lo tiene → total presente
  expect(t.salt_g).toBeCloseTo(0.2, 1); // 80 mg de sodio = 0,2 g de sal
});

test("la sal del total se deriva del sodio SUMADO, no de convertir cada ítem", () => {
  // Dos ítems de 50 mg de sodio: sumar y convertir da 100 mg → 0,25 → 0,3 g; convertir cada uno
  // y sumar daría 0,1 + 0,1 = 0,2 g. Es el mismo criterio (y el mismo riesgo) que el total del día.
  const saladito = { ...banana, sodium_mg: 50, unitWeightG: null };
  const t = mealTotals([
    { food: saladito, quantity: 100, unit: "g" },
    { food: saladito, quantity: 100, unit: "g" },
  ]);
  expect(t.salt_g).toBe(0.3);
});

test("ningún ítem con sodio → la sal es null, no 0", () => {
  const sinSodio = { ...banana, sodium_mg: null };
  expect(mealTotals([{ food: sinSodio, quantity: 100, unit: "g" }]).salt_g).toBeNull();
});

test("mealTotals: un micro null en TODOS los ítems → total null", () => {
  const noFiber = { ...banana, fiber_g: null };
  const t = mealTotals([{ food: noFiber, quantity: 100, unit: "g" }]);
  expect(t.fiber_g).toBeNull();
});

test("mealTotals suma colesterol y agua", () => {
  const t = mealTotals([{ food: banana, quantity: 1, unit: "unit" }, { food: leche, quantity: 200, unit: "ml" }]);
  // banana 1u=120g: chol 0, agua 90 ; leche 200ml: chol 20, agua 176
  expect(t.cholesterol_mg).toBeCloseTo(20, 1);
  expect(t.water_ml).toBeCloseTo(266, 0);
});

// --- horario editable (HH:MM) ---

// 2026-08-14 14:35 local. Usamos componentes locales para no atarnos a la TZ del runner:
// construimos el instante con new Date(y,m,d,h,mm) y verificamos con getHours/getMinutes.
const day = new Date(2026, 7, 14, 14, 35, 0, 0).getTime(); // agosto = mes 7

test("hhmmFromMs formatea la hora local con padStart", () => {
  expect(hhmmFromMs(new Date(2026, 7, 14, 8, 5, 0, 0).getTime())).toBe("08:05");
  expect(hhmmFromMs(new Date(2026, 7, 14, 23, 59, 0, 0).getTime())).toBe("23:59");
  expect(hhmmFromMs(new Date(2026, 7, 14, 0, 0, 0, 0).getTime())).toBe("00:00");
});

test("combineDayAndTime aplica la hora al día de dayMs y preserva la fecha", () => {
  const out = combineDayAndTime(day, "08:00");
  expect(out).not.toBeNull();
  const d = new Date(out as number);
  expect(d.getFullYear()).toBe(2026);
  expect(d.getMonth()).toBe(7);
  expect(d.getDate()).toBe(14);
  expect(d.getHours()).toBe(8);
  expect(d.getMinutes()).toBe(0);
  expect(d.getSeconds()).toBe(0);
  expect(d.getMilliseconds()).toBe(0);
});

test("combineDayAndTime acepta los bordes 00:00 y 23:59", () => {
  expect(combineDayAndTime(day, "00:00")).not.toBeNull();
  expect(combineDayAndTime(day, "23:59")).not.toBeNull();
});

test("combineDayAndTime devuelve null para HH:MM inválido", () => {
  for (const bad of ["24:00", "12:60", "8", "", "aa:bb", "8:5", "-1:00", "12:5"]) {
    expect(combineDayAndTime(day, bad)).toBeNull();
  }
});

test("hhmmFromMs ↔ combineDayAndTime round-trip sobre el mismo día", () => {
  const s = hhmmFromMs(day);
  const back = combineDayAndTime(day, s);
  expect(hhmmFromMs(back as number)).toBe(s);
});
