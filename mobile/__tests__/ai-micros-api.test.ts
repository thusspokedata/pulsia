import { aiMicrosForFood, proposeAiMicros, applyAiMicros } from "../src/api/nutrition";
import type { FoodIdentification } from "@pulsia/shared";

const identificacion: FoodIdentification = {
  name: "Limonada casera", basis: "per_100ml", kcal: 40, protein_g: 0, carbs_g: 10, fat_g: 0,
  unitWeightG: null, sourceMacros: "ai", searchQuery: "lemonade homemade", cookingYield: null,
};

afterEach(() => { (global.fetch as unknown) = undefined; });

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = jest.fn().mockResolvedValue({ ok, status, json: async () => body });
  (global.fetch as unknown) = fn;
  return fn;
}

test("aiMicrosForFood hace POST /nutrition/foods/ai-micros con la identificación", async () => {
  const fn = mockFetch({ ...identificacion, sourceMicros: "ai", usdaFdcId: null, vitamin_c_mg: 8 });
  const res = await aiMicrosForFood("http://x", identificacion);
  expect(res.sourceMicros).toBe("ai");
  const [url, init] = fn.mock.calls[0];
  expect(url).toBe("http://x/nutrition/foods/ai-micros");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ identification: identificacion });
});

test("aiMicrosForFood lanza si el backend responde error", async () => {
  mockFetch({ error: "boom" }, false, 502);
  await expect(aiMicrosForFood("http://x", identificacion)).rejects.toThrow();
});

test("proposeAiMicros hace POST /nutrition/foods/:id/ai-micros-proposal", async () => {
  const fn = mockFetch({ identification: identificacion, proposal: { ...identificacion, sourceMicros: "ai" }, mealsAffected: 2 });
  const res = await proposeAiMicros("http://x", "food-1");
  expect(res.mealsAffected).toBe(2);
  expect(fn.mock.calls[0][0]).toBe("http://x/nutrition/foods/food-1/ai-micros-proposal");
});

test("applyAiMicros hace POST /nutrition/foods/:id/ai-micros-apply con { food }", async () => {
  const fn = mockFetch({ mealsUpdated: 2, itemsUpdated: 3 });
  const food = { ...identificacion, sourceMicros: "ai", usdaFdcId: null, vitamin_c_mg: 8 } as any;
  const res = await applyAiMicros("http://x", "food-1", food);
  expect(res).toEqual({ mealsUpdated: 2, itemsUpdated: 3 });
  const [url, init] = fn.mock.calls[0];
  expect(url).toBe("http://x/nutrition/foods/food-1/ai-micros-apply");
  expect(JSON.parse(init.body)).toEqual({ food });
});
