import { searchUsdaFoods, assembleUsdaFood, proposeUsdaRefresh, applyUsdaRefresh } from "../src/api/nutrition";
import type { FoodIdentification } from "@pulsia/shared";

const identificacion: FoodIdentification = {
  name: "Huevo frito", basis: "per_100g", kcal: 196, protein_g: 13.6, carbs_g: 0.8, fat_g: 14.8,
  unitWeightG: 46, sourceMacros: "ai", searchQuery: "fried egg",
};

afterEach(() => { (global.fetch as unknown) = undefined; });

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = jest.fn().mockResolvedValue({ ok, status, json: async () => body });
  (global.fetch as unknown) = fn;
  return fn;
}

test("searchUsdaFoods hace GET /nutrition/usda/search y devuelve los candidatos", async () => {
  const fila = { fdcId: 173424, description: "Egg, whole, cooked, fried", dataType: "sr_legacy_food" };
  const fn = mockFetch([fila]);
  const res = await searchUsdaFoods("http://x", "fried egg");
  expect(res).toEqual([fila]);
  // El término va ESCAPADO: sin encodeURIComponent, "fried egg" corta la query en el espacio y
  // el backend recibe "fried" (o un 400), que no es lo que el usuario escribió.
  expect(fn.mock.calls[0][0]).toBe("http://x/nutrition/usda/search?q=fried%20egg");
});

test("searchUsdaFoods escapa los caracteres que romperían la query", async () => {
  const fn = mockFetch([]);
  await searchUsdaFoods("http://x", "cheese & ham");
  expect(fn.mock.calls[0][0]).toBe("http://x/nutrition/usda/search?q=cheese%20%26%20ham");
});

test("searchUsdaFoods lanza si el backend responde con error", async () => {
  mockFetch({ error: "boom" }, false, 500);
  await expect(searchUsdaFoods("http://x", "egg")).rejects.toThrow();
});

test("assembleUsdaFood hace POST /nutrition/usda/assemble con la identificación y el fdcId", async () => {
  const fn = mockFetch({ ...identificacion, sourceMicros: "usda", usdaFdcId: 173424 });
  const res = await assembleUsdaFood("http://x", identificacion, 173424);
  expect(res.usdaFdcId).toBe(173424);
  const [url, init] = fn.mock.calls[0];
  expect(url).toBe("http://x/nutrition/usda/assemble");
  expect(init.method).toBe("POST");
  // La identificación viaja ENTERA: el backend la revalida con FoodIdentificationSchema, y sin
  // `searchQuery` (que no es un campo de FoodExtraction) rebota con 400.
  expect(JSON.parse(init.body)).toEqual({ identification: identificacion, fdcId: 173424 });
});

test("assembleUsdaFood lanza si el fdcId no existe (404)", async () => {
  // El backend NO degrada a "sin micros" a propósito: el usuario pidió ESA fila. Si el wrapper se
  // tragara el 404, el formulario mostraría el alimento con todo en null como si fuera el elegido.
  mockFetch({ error: "No encontrado" }, false, 404);
  await expect(assembleUsdaFood("http://x", identificacion, 999999)).rejects.toThrow();
});

// ---- Actualizar un alimento YA guardado contra USDA ----

const FOOD_ID = "11111111-1111-4111-8111-111111111111";
const PROPUESTA = {
  identification: identificacion,
  candidates: [{ fdcId: 173424, description: "Egg, whole, cooked, fried", dataType: "sr_legacy_food" }],
  chosen: 173424,
  proposal: { ...identificacion, sourceMicros: "usda", usdaFdcId: 173424, iron_mg: 1.9 },
  mealsAffected: 2,
};

test("proposeUsdaRefresh hace POST /nutrition/foods/:id/usda-proposal y devuelve la propuesta entera", async () => {
  const fn = mockFetch(PROPUESTA);
  const res = await proposeUsdaRefresh("http://x", FOOD_ID);
  const [url, init] = fn.mock.calls[0];
  expect(url).toBe(`http://x/nutrition/foods/${FOOD_ID}/usda-proposal`);
  expect(init.method).toBe("POST");
  // Los cuatro datos que la pantalla necesita: qué eligió, con qué corregirlo, qué propone y —el
  // que hace segura la feature— cuántas comidas se van a reescribir.
  expect(res.chosen).toBe(173424);
  expect(res.candidates).toHaveLength(1);
  expect(res.mealsAffected).toBe(2);
  expect(res.identification).toEqual(identificacion);
});

test("proposeUsdaRefresh se da más tiempo que el default: la propuesta hace DOS llamadas a la IA", async () => {
  // Generar la frase de búsqueda y elegir el candidato son dos respuestas de Opus: con los 15 s
  // por defecto de apiFetch el AbortController corta el request antes que el backend conteste, y
  // el usuario ve "Aborted" en un alimento que sí matcheaba.
  const spy = jest.spyOn(global, "setTimeout");
  mockFetch(PROPUESTA);
  await proposeUsdaRefresh("http://x", FOOD_ID);
  expect(spy).toHaveBeenCalledWith(expect.any(Function), 60000);
  expect(spy).not.toHaveBeenCalledWith(expect.any(Function), 15000);
  spy.mockRestore();
});

test("proposeUsdaRefresh lanza con el mensaje del backend si no hay API key (400)", async () => {
  mockFetch({ error: "No hay API key de IA disponible." }, false, 400);
  await expect(proposeUsdaRefresh("http://x", FOOD_ID)).rejects.toThrow("No hay API key de IA disponible.");
});

test("applyUsdaRefresh hace POST /usda-apply con la identificación y el fdcId, y devuelve el conteo", async () => {
  const fn = mockFetch({ mealsUpdated: 2, itemsUpdated: 3 });
  const res = await applyUsdaRefresh("http://x", FOOD_ID, identificacion, 173424);
  const [url, init] = fn.mock.calls[0];
  expect(url).toBe(`http://x/nutrition/foods/${FOOD_ID}/usda-apply`);
  expect(init.method).toBe("POST");
  // El backend solo usa el `fdcId` (re-arma la identificación server-side), pero el body está
  // validado con FoodIdentificationSchema: mandarlo incompleto rebota con 400.
  expect(JSON.parse(init.body)).toEqual({ identification: identificacion, fdcId: 173424 });
  expect(res).toEqual({ mealsUpdated: 2, itemsUpdated: 3 });
});

test("applyUsdaRefresh lanza si el alimento o el fdcId no existen (404)", async () => {
  // Tragarse este error dejaría la pantalla recargando el alimento como si se hubiera aplicado,
  // cuando en la base no cambió nada.
  mockFetch({ error: "No encontrado" }, false, 404);
  await expect(applyUsdaRefresh("http://x", FOOD_ID, identificacion, 999999)).rejects.toThrow();
});
