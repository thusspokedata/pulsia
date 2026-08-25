import { buildNutrientRows, filaDeAzucar, filaDeSal, porcentaje, sustituirAzucar } from "../src/nutrition/nutrientRows";

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

test("una referencia pasada por opciones MANDA sobre la de EFSA", () => {
  // La pestaña del día compara 5 nutrientes contra la OMS. La precedencia se prueba con un
  // nutriente que EFSA SÍ cubre (hierro, 11 mg): si el override no mandara, el ref seguiría en 11
  // y el test no distinguiría nada.
  const g = buildNutrientRows({ iron_mg: 5.5 }, persona, { refs: { iron_mg: { value: 22, kind: "max" } } });
  const f = fila(g, "iron_mg");
  expect(f.ref).toBe(22);
  expect(f.kind).toBe("max");
  expect(f.pct).toBe(25);
});

test("una referencia pasada como null explícito borra la de EFSA (no cae de vuelta en ella)", () => {
  // Es el caso de las saturadas sin meta de kcal: no hay referencia que mostrar, y la fila tiene
  // que quedarse SIN barra en vez de heredar la de otra tabla.
  const g = buildNutrientRows({ iron_mg: 5.5 }, persona, { refs: { iron_mg: null } });
  const f = fila(g, "iron_mg");
  expect(f.ref).toBeNull();
  expect(f.pct).toBeNull();
});

test("un nutriente marcado como parcial llega marcado a la fila", () => {
  const g = buildNutrientRows({ zinc_mg: 0.8 }, persona, { partial: { zinc_mg: true } });
  expect(fila(g, "zinc_mg").partial).toBe(true);
  expect(fila(g, "iron_mg").partial).toBe(false); // el resto no se contagia
});

test("sin opciones, ninguna fila es parcial", () => {
  const g = buildNutrientRows({ zinc_mg: 0.8 }, persona);
  expect(filas(g).every((r) => r.partial === false)).toBe(true);
});

test("todas las claves del registro producen exactamente una fila", () => {
  const g = buildNutrientRows({}, persona);
  const keys = filas(g).map((r) => r.key);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys).toContain("water_ml");
});

// ---------------------------------------------------------------------------------------------
// Fix 1: "hay suplemento" también es dato. Un nutriente sin dato de comida (value: null) no puede
// esconder el aporte de un suplemento: el total consumido es (value ?? 0) + (supplement ?? 0).
// ---------------------------------------------------------------------------------------------

test("sin dato de comida pero con suplemento > 0: el pct SÍ se calcula (sobre el suplemento solo)", () => {
  const g = buildNutrientRows({ iron_mg: null }, persona, { supplement: { iron_mg: 5.5 } });
  const f = fila(g, "iron_mg");
  // `value` sigue siendo SOLO comida: no se le mezcla el suplemento adentro.
  expect(f.value).toBeNull();
  expect(f.supplement).toBe(5.5);
  expect(f.ref).toBe(11);
  expect(f.pct).toBe(50); // 5.5 / 11, igual que si esos 5.5 vinieran de comida
});

test("nutriente ausente en `values` (no solo null) también deja pasar el suplemento", () => {
  const g = buildNutrientRows({}, persona, { supplement: { iron_mg: 5.5 } });
  const f = fila(g, "iron_mg");
  expect(f.value).toBeNull();
  expect(f.pct).toBe(50);
});

test("suplemento en 0 explícito sin comida sigue siendo 'sin dato': 0 no es 'hay suplemento'", () => {
  const g = buildNutrientRows({ iron_mg: null }, persona, { supplement: { iron_mg: 0 } });
  const f = fila(g, "iron_mg");
  expect(f.value).toBeNull();
  expect(f.pct).toBeNull();
});

test("sin comida y sin suplemento en el mapa: sigue sin dato (comportamiento sin cambios)", () => {
  const g = buildNutrientRows({ iron_mg: null }, persona);
  const f = fila(g, "iron_mg");
  expect(f.pct).toBeNull();
});

test("con comida Y suplemento, el pct sigue sumando los dos (sin regresión)", () => {
  const g = buildNutrientRows({ iron_mg: 5.5 }, persona, { supplement: { iron_mg: 5.5 } });
  const f = fila(g, "iron_mg");
  expect(f.value).toBe(5.5);
  expect(f.supplement).toBe(5.5);
  expect(f.pct).toBe(100); // (5.5 + 5.5) / 11
});

test("sin suplemento (modo catálogo / comida) no cambia: value null sigue en pct null", () => {
  const g = buildNutrientRows({ iron_mg: null }, persona, { supplement: {} });
  expect(fila(g, "iron_mg").pct).toBeNull();
});

// ---------------------------------------------------------------------------------------------
// Mismo criterio para la fila de sal derivada del sodio.
// ---------------------------------------------------------------------------------------------

test("filaDeSal: sin sodio de comida pero con sodio de suplemento, el pct se calcula igual", () => {
  // 800 mg de sodio de suplemento = 2 g de sal.
  const f = filaDeSal(null, 5, false, 2);
  expect(f.value).toBeNull();
  expect(f.supplement).toBe(2);
  expect(f.pct).toBe(porcentaje(2, 5));
});

test("filaDeSal: supplementSaltG en 0 sin sodio de comida sigue sin dato", () => {
  const f = filaDeSal(null, 5, false, 0);
  expect(f.value).toBeNull();
  expect(f.pct).toBeNull();
});

test("filaDeSal: sin sodio de comida ni de suplemento sigue sin dato (comportamiento sin cambios)", () => {
  const f = filaDeSal(null, 5);
  expect(f.value).toBeNull();
  expect(f.pct).toBeNull();
});

// ---------------------------------------------------------------------------------------------
// filaDeAzucar: la fila mide LIBRES, no el total. El total viaja en `split` solo para el render.
// ---------------------------------------------------------------------------------------------

test("filaDeAzucar: el value es el azúcar LIBRE, no el total", () => {
  // 40 g de azúcar total, 10 libres: la fila muestra 10 (contra el techo OMS), no 40. Un mutante
  // que pusiera el total en value daría 40.
  const f = filaDeAzucar(10, 40, 50);
  expect(f.key).toBe("sugars_g");
  expect(f.label).toBe("Azúcares libres");
  expect(f.unit).toBe("g");
  expect(f.value).toBe(10);
});

test("filaDeAzucar: el split parte el total en intrínseco (total − libre) y libre", () => {
  const f = filaDeAzucar(10, 40, 50);
  expect(f.split).toEqual({ total: 40, intrinsic: 30, free: 10 });
});

test("filaDeAzucar: el pct se mide sobre los LIBRES contra la referencia, no sobre el total", () => {
  // 10 libres / 50 = 20%. Con el total (40/50) daría 80%: la distinción es el punto de la feature.
  const f = filaDeAzucar(10, 40, 50);
  expect(f.pct).toBe(porcentaje(10, 50));
  expect(f.pct).toBe(20);
});

test("filaDeAzucar: el kind es 'max' cuando hay referencia (es un techo, no un piso)", () => {
  expect(filaDeAzucar(10, 40, 50).kind).toBe("max");
});

test("filaDeAzucar: sin referencia no hay kind ni pct", () => {
  const f = filaDeAzucar(10, 40, null);
  expect(f.kind).toBeNull();
  expect(f.pct).toBeNull();
});

test("filaDeAzucar: pura fruta entera (libre 0) no excede aunque el total sea alto", () => {
  const f = filaDeAzucar(0, 60, 50);
  expect(f.value).toBe(0);
  expect(f.pct).toBe(0);
  expect(f.split).toEqual({ total: 60, intrinsic: 60, free: 0 });
});

test("filaDeAzucar: sin total conocido, intrinsic es null (no se puede restar de la nada)", () => {
  const f = filaDeAzucar(10, null, 50);
  expect(f.split).toEqual({ total: null, intrinsic: null, free: 10 });
});

test("filaDeAzucar: libre null y total null → intrinsic null", () => {
  const f = filaDeAzucar(null, null, 50);
  expect(f.split).toEqual({ total: null, intrinsic: null, free: null });
});

test("filaDeAzucar: el azúcar de suplemento cuenta como libre en el pct", () => {
  // 5 libres de comida + 5 de suplemento = 10 / 50 = 20%.
  const f = filaDeAzucar(5, 20, 50, false, 5);
  expect(f.supplement).toBe(5);
  expect(f.pct).toBe(porcentaje(10, 50));
});

test("filaDeAzucar: sin libre de comida pero con suplemento, el pct se calcula igual", () => {
  const f = filaDeAzucar(null, null, 50, false, 10);
  expect(f.value).toBeNull();
  expect(f.pct).toBe(porcentaje(10, 50));
});

test("filaDeAzucar: la marca partial se conserva", () => {
  expect(filaDeAzucar(10, 40, 50, true).partial).toBe(true);
  expect(filaDeAzucar(10, 40, 50, false).partial).toBe(false);
});

test("sustituirAzucar: reemplaza la fila de sugars_g por la derivada, en su lugar", () => {
  const secciones = buildNutrientRows({ sugars_g: 40 }, persona, {
    refs: { sugars_g: { value: 50, kind: "max" } },
  });
  const derivada = filaDeAzucar(10, 40, 50);
  const out = sustituirAzucar(secciones, derivada);
  const f = fila(out, "sugars_g");
  expect(f.label).toBe("Azúcares libres");
  expect(f.value).toBe(10);
  // sigue habiendo exactamente UNA fila con esa clave (se reemplazó, no se agregó)
  expect(filas(out).filter((r) => r.key === "sugars_g").length).toBe(1);
});
