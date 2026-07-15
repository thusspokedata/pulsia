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
