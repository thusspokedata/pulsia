import { searchUsdaFoods, assembleUsdaFood } from "../src/api/nutrition";
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
