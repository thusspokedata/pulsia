import {
  extractSupplement,
  createSupplement,
  listSupplements,
  explainSupplement,
  deleteSupplement,
  getPlan,
  generatePlan,
  updatePlanItem,
  getDayChecklist,
  putTake,
  getSupplement,
  getDayNutrients,
  getRangeNutrients,
  addAdHocTake,
  deleteAdHocTake,
} from "../src/api/supplements";

const extraction = {
  name: "ZMA Pro",
  servingLabel: "2 cápsulas",
  components: [{ name: "Zinc", amount: 10, unit: "mg" }],
  source: "label",
  info: "El zinc participa en el sistema inmune.",
};

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => extraction })) as any;
});

afterEach(() => {
  (global.fetch as any) = undefined;
});

test("extractSupplement hace POST a /nutrition/supplements/extract con la imagen", async () => {
  const out = await extractSupplement("http://x", "AAAA", "image/jpeg");
  expect(out.name).toBe("ZMA Pro");
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(String(url)).toContain("/nutrition/supplements/extract");
  expect(JSON.parse(init.body)).toMatchObject({ imageBase64: "AAAA", mediaType: "image/jpeg" });
});

test("createSupplement / listSupplements / deleteSupplement pegan a /nutrition/supplements", async () => {
  await createSupplement("http://x", extraction as any);
  await listSupplements("http://x");
  await deleteSupplement("http://x", "abc");
  const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
  expect(urls[0]).toContain("/nutrition/supplements");
  expect(urls[2]).toContain("/nutrition/supplements/abc");
});

test("explainSupplement hace POST a /:id/explain", async () => {
  await explainSupplement("http://x", "abc");
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(String(url)).toContain("/nutrition/supplements/abc/explain");
  expect(init.method).toBe("POST");
});

test("errores del backend se traducen a Error con mensaje", async () => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 502, json: async () => ({ error: "No se pudo analizar la foto." }) })) as any;
  await expect(extractSupplement("http://x", "AAAA", "image/jpeg")).rejects.toThrow(/analizar la foto/);
});

test("getPlan devuelve { plan, warnings } tal como los manda el backend", async () => {
  const planResponse = { plan: { id: "p1", items: [] }, warnings: ["ojo con el zinc"] };
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => planResponse })) as any;
  const out = await getPlan("http://x");
  expect(out).toEqual(planResponse);
});

test("generatePlan devuelve { plan, warnings } tal como los manda el backend", async () => {
  const planResponse = { plan: { id: "p1", items: [] }, warnings: ["ojo con el magnesio"] };
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => planResponse })) as any;
  const out = await generatePlan("http://x", { athleteContext: { goal: { status: "incomplete" } }, date: "2026-07-16" } as any);
  expect(out).toEqual(planResponse);
});

test("getPlan / generatePlan / updatePlanItem / getDayChecklist / putTake / getSupplement pegan a las rutas correctas", async () => {
  await getPlan("http://x");
  await generatePlan("http://x", { athleteContext: { goal: { status: "incomplete" } }, date: "2026-07-16" } as any);
  await updatePlanItem("http://x", "abc", { dose: "5 g" });
  await getDayChecklist("http://x", "2026-07-16");
  await putTake("http://x", { date: "2026-07-16", planItemId: "abc", status: "taken" } as any);
  await getSupplement("http://x", "abc");
  const calls = (global.fetch as jest.Mock).mock.calls;
  expect(String(calls[0][0])).toContain("/nutrition/supplements/plan");
  expect(String(calls[1][0])).toContain("/nutrition/supplements/plan/generate");
  expect(calls[1][1].method).toBe("POST");
  expect(String(calls[2][0])).toContain("/nutrition/supplements/plan/items/abc");
  expect(calls[2][1].method).toBe("PATCH");
  expect(String(calls[3][0])).toContain("/nutrition/supplements/day?date=2026-07-16");
  expect(String(calls[4][0])).toContain("/nutrition/supplements/takes");
  expect(calls[4][1].method).toBe("PUT");
  expect(String(calls[5][0])).toContain("/nutrition/supplements/abc");
});

test("getDayNutrients / getRangeNutrients pegan al prefijo /nutrition/supplements con los query params", async () => {
  const nutrients = { totals: { zinc_mg: 10 }, byNutrient: { zinc_mg: [{ supplementName: "ZMA", amount: 10 }] } };
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => nutrients })) as any;
  const day = await getDayNutrients("http://x", "2026-07-16");
  const range = await getRangeNutrients("http://x", "2026-07-01", "2026-07-16");
  expect(day).toEqual(nutrients);
  expect(range).toEqual(nutrients);
  const calls = (global.fetch as jest.Mock).mock.calls;
  expect(String(calls[0][0])).toContain("/nutrition/supplements/day-nutrients?date=2026-07-16");
  expect(String(calls[1][0])).toContain("/nutrition/supplements/range-nutrients?from=2026-07-01&to=2026-07-16");
});

test("getDayNutrients / getRangeNutrients degradan limpio (no rompen el día) si la respuesta falla", async () => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as any;
  expect(await getDayNutrients("http://x", "2026-07-16")).toEqual({ totals: {}, byNutrient: {} });
  expect(await getRangeNutrients("http://x", "2026-07-01", "2026-07-16")).toEqual({ totals: {}, byNutrient: {} });
});

test("getDayNutrients / getRangeNutrients degradan limpio si el fetch tira (red/timeout)", async () => {
  global.fetch = jest.fn(async () => { throw new Error("network down"); }) as any;
  expect(await getDayNutrients("http://x", "2026-07-16")).toEqual({ totals: {}, byNutrient: {} });
  expect(await getRangeNutrients("http://x", "2026-07-01", "2026-07-16")).toEqual({ totals: {}, byNutrient: {} });
});

test("addAdHocTake postea a /takes/adhoc con el body correcto", async () => {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, id: "x" }) })) as any;
  await addAdHocTake("http://x", { date: "2026-08-10", supplementId: "s1", slot: "desayuno", dose: "1 cápsula" });
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(String(url)).toContain("/nutrition/supplements/takes/adhoc");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toMatchObject({ date: "2026-08-10", supplementId: "s1", slot: "desayuno", dose: "1 cápsula" });
});

test("deleteAdHocTake llama DELETE /takes/adhoc/:id", async () => {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })) as any;
  await deleteAdHocTake("http://x", "t1");
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(String(url)).toContain("/nutrition/supplements/takes/adhoc/t1");
  expect(init.method).toBe("DELETE");
});
