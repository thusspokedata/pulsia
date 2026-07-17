import { parseSleepCsv, importSleepCsv } from "../src/api/metrics";

jest.mock("../src/storage/authToken", () => ({ getToken: async () => "t0ken", clearToken: async () => {} }));
jest.mock("../src/auth/unauthorized", () => ({ notifyUnauthorized: () => {} }));

function mockFetch(body: unknown, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({ ok, status, json: async () => body } as any);
}

test("parseSleepCsv POSTea a /metrics/import/sleep/parse con el base64", async () => {
  const preview = { rows: [], skipped: [] };
  global.fetch = mockFetch(preview) as any;
  const res = await parseSleepCsv("http://x", "YmFzZTY0");
  expect(res).toEqual(preview);
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe("http://x/metrics/import/sleep/parse");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ csvBase64: "YmFzZTY0" });
});

test("importSleepCsv POSTea a /metrics/import/sleep", async () => {
  const result = { imported: 3, duplicates: 1, rows: [], skipped: [] };
  global.fetch = mockFetch(result) as any;
  const res = await importSleepCsv("http://x", "YmFzZTY0");
  expect(res).toEqual(result);
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe("http://x/metrics/import/sleep");
  expect(init.method).toBe("POST");
});

test("parseSleepCsv propaga el error del backend", async () => {
  global.fetch = mockFetch({ error: "No parece un CSV de sueño" }, false, 400) as any;
  await expect(parseSleepCsv("http://x", "z")).rejects.toThrow("No parece un CSV de sueño");
});
