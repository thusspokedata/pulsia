import { parseGarminCsv, importGarminCsv } from "../src/api/metrics";

jest.mock("../src/storage/authToken", () => ({ getToken: async () => "t0ken", clearToken: async () => {} }));
jest.mock("../src/auth/unauthorized", () => ({ notifyUnauthorized: () => {} }));

function mockFetch(body: unknown, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({ ok, status, json: async () => body } as any);
}

test("parseGarminCsv POSTea a /metrics/import/sleep/parse cuando kind es sleep", async () => {
  const preview = { rows: [], skipped: [] };
  global.fetch = mockFetch(preview) as any;
  const res = await parseGarminCsv("http://x", "sleep", "YmFzZTY0");
  expect(res).toEqual(preview);
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe("http://x/metrics/import/sleep/parse");
  expect(init.method).toBe("POST");
});

test("parseGarminCsv POSTea a /metrics/import/weight/parse cuando kind es weight", async () => {
  const preview = { rows: [], skipped: [] };
  global.fetch = mockFetch(preview) as any;
  const res = await parseGarminCsv("http://x", "weight", "YmFzZTY0");
  expect(res).toEqual(preview);
  const [url] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe("http://x/metrics/import/weight/parse");
});

test("parseGarminCsv POSTea a /metrics/import/steps/parse cuando kind es steps", async () => {
  const preview = { rows: [], skipped: [] };
  global.fetch = mockFetch(preview) as any;
  const res = await parseGarminCsv("http://x", "steps", "YmFzZTY0");
  expect(res).toEqual(preview);
  const [url] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe("http://x/metrics/import/steps/parse");
});

test("importGarminCsv POSTea a /metrics/import/steps cuando kind es steps", async () => {
  const result = { imported: 3, duplicates: 1, rows: [], skipped: [] };
  global.fetch = mockFetch(result) as any;
  const res = await importGarminCsv("http://x", "steps", "YmFzZTY0");
  expect(res).toEqual(result);
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe("http://x/metrics/import/steps");
  expect(init.method).toBe("POST");
});

test("parseGarminCsv manda tzOffsetMinutes igual a new Date().getTimezoneOffset()", async () => {
  const preview = { rows: [], skipped: [] };
  global.fetch = mockFetch(preview) as any;
  await parseGarminCsv("http://x", "sleep", "YmFzZTY0");
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(JSON.parse(init.body)).toEqual({ csvBase64: "YmFzZTY0", tzOffsetMinutes: new Date().getTimezoneOffset() });
});

test("importGarminCsv manda tzOffsetMinutes igual a new Date().getTimezoneOffset()", async () => {
  const result = { imported: 0, duplicates: 0, rows: [], skipped: [] };
  global.fetch = mockFetch(result) as any;
  await importGarminCsv("http://x", "weight", "YmFzZTY0");
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(JSON.parse(init.body)).toEqual({ csvBase64: "YmFzZTY0", tzOffsetMinutes: new Date().getTimezoneOffset() });
});

test("parseGarminCsv propaga el error del backend", async () => {
  global.fetch = mockFetch({ error: "No parece un CSV de sueño" }, false, 400) as any;
  await expect(parseGarminCsv("http://x", "sleep", "z")).rejects.toThrow("No parece un CSV de sueño");
});

test("importGarminCsv propaga el error del backend", async () => {
  global.fetch = mockFetch({ error: "No se pudo importar" }, false, 400) as any;
  await expect(importGarminCsv("http://x", "weight", "z")).rejects.toThrow("No se pudo importar");
});
