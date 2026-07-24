import { buildNutrientRows } from "../src/nutrition/nutrientRows";

const persona = { sex: "male" as const, age: 35 };

const filas = (g: ReturnType<typeof buildNutrientRows>) => g.flatMap((s) => s.rows);
const fila = (g: ReturnType<typeof buildNutrientRows>, key: string) =>
  filas(g).find((r) => r.key === key)!;

test("agrupa en el orden del registro: grasas, carbohidratos, vitaminas, minerales", () => {
  const g = buildNutrientRows({ iron_mg: 5 }, persona);
  expect(g.map((s) => s.group)).toEqual(["grasas", "carbohidratos", "vitaminas", "minerales"]);
});

test("cada sección trae una etiqueta legible para el encabezado", () => {
  const g = buildNutrientRows({}, persona);
  expect(g.map((s) => s.label)).toEqual(["Grasas", "Carbohidratos", "Vitaminas", "Minerales"]);
});

test("las secciones aparecen aunque ningún nutriente del grupo tenga dato", () => {
  // Un alimento cargado a mano, sin match de USDA, no tiene ningún micro: las secciones de
  // vitaminas y minerales igual se muestran, enteras en "sin dato".
  const g = buildNutrientRows({}, persona);
  const vitaminas = g.find((s) => s.group === "vitaminas")!;
  expect(vitaminas.rows.length).toBeGreaterThan(0);
  expect(vitaminas.rows.every((r) => r.value === null)).toBe(true);
});

test("un nutriente sin dato es 'sin dato': ni valor ni porcentaje", () => {
  const g = buildNutrientRows({}, persona);
  const f = fila(g, "zinc_mg");
  expect(f.value).toBeNull();
  expect(f.pct).toBeNull();
});

test("un null explícito también es sin dato, no cero", () => {
  const g = buildNutrientRows({ zinc_mg: null }, persona);
  const f = fila(g, "zinc_mg");
  expect(f.value).toBeNull();
  expect(f.pct).toBeNull();
});

test("un nutriente en 0 NO es lo mismo que sin dato", () => {
  const g = buildNutrientRows({ zinc_mg: 0 }, persona);
  const f = fila(g, "zinc_mg");
  expect(f.value).toBe(0);
  expect(f.pct).toBe(0);
});

test("el porcentaje se calcula contra la referencia EFSA de esa persona", () => {
  // hierro: varón 11 mg → 5.5 mg es el 50%
  const g = buildNutrientRows({ iron_mg: 5.5 }, persona);
  const f = fila(g, "iron_mg");
  expect(f.ref).toBe(11);
  expect(f.kind).toBe("min");
  expect(f.pct).toBe(50);
});

test("la MISMA cantidad da un porcentaje distinto para una mujer (hierro 16 mg)", () => {
  const varon = buildNutrientRows({ iron_mg: 5.5 }, persona);
  const mujer = buildNutrientRows({ iron_mg: 5.5 }, { sex: "female", age: 35 });
  const p = (g: ReturnType<typeof buildNutrientRows>) => fila(g, "iron_mg").pct;
  expect(p(varon)).toBe(50);
  expect(p(mujer)).toBe(34); // 5.5 / 16
  expect(p(mujer)!).toBeLessThan(p(varon)!);
});

test("sin referencia (EFSA no lo cubre) hay valor pero no porcentaje", () => {
  const g = buildNutrientRows({ omega3_g: 1 }, persona);
  const f = fila(g, "omega3_g");
  expect(f.value).toBe(1);
  expect(f.ref).toBeNull();
  expect(f.pct).toBeNull();
});

test("sin referencia diaria (modo catálogo, por 100 g) ninguna fila tiene porcentaje", () => {
  const g = buildNutrientRows({ iron_mg: 5.5 }, null);
  expect(filas(g).every((r) => r.pct === null)).toBe(true);
  expect(filas(g).every((r) => r.ref === null)).toBe(true);
  // pero el valor SÍ se muestra: es el dato del alimento por 100 g
  expect(fila(g, "iron_mg").value).toBe(5.5);
});

test("un sexo desconocido cae al fallback conservador, no a la tabla masculina", () => {
  // "prefer_not_to_say" no tiene tabla EFSA: se usa el valor más exigente (hierro 16 mg).
  const g = buildNutrientRows({ iron_mg: 5.5 }, { sex: "prefer_not_to_say", age: 35 });
  expect(fila(g, "iron_mg").ref).toBe(16);
});

test("la fila lleva la etiqueta y la unidad del registro", () => {
  const g = buildNutrientRows({ vitamin_d_mcg: 3 }, persona);
  const f = fila(g, "vitamin_d_mcg");
  expect(f.label).toBe("Vitamina D");
  expect(f.unit).toBe("mcg");
});

test("un porcentaje diminuto pero real no se muestra como 0", () => {
  // 0.02 mg de zinc sobre 11.7 es 0.17%: redondear a 0 lo haría indistinguible de un cero real,
  // que es exactamente la confusión que este módulo existe para evitar.
  const g = buildNutrientRows({ zinc_mg: 0.02 }, persona);
  expect(fila(g, "zinc_mg").pct).toBe(1);
});

test("pasarse de la referencia da más de 100%", () => {
  const g = buildNutrientRows({ iron_mg: 22 }, persona);
  expect(fila(g, "iron_mg").pct).toBe(200);
});

test("todas las claves del registro producen exactamente una fila", () => {
  const g = buildNutrientRows({}, persona);
  const keys = filas(g).map((r) => r.key);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys).toContain("water_ml");
});
