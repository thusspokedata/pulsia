import {
  extractSupplement,
  createSupplement,
  listSupplements,
  explainSupplement,
  deleteSupplement,
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
