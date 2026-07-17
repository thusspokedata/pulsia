import { parseFitCardio } from "../src/api/cardio";

afterEach(() => { (global.fetch as any) = undefined; });

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = jest.fn().mockResolvedValue({ ok, status, json: async () => body });
  (global.fetch as any) = fn;
  return fn;
}

test("parseFitCardio postea el base64 y devuelve el preview", async () => {
  const preview = { type: "walk", startedAt: 1, durationMs: 60000, distanceM: null, avgHr: null, maxHr: null, elevationGainM: null, kcal: 150 };
  const fn = mockFetch(preview);
  const res = await parseFitCardio("http://x", "QUJD");
  expect(res.kcal).toBe(150);
  const [url, init] = fn.mock.calls[0];
  expect(url).toBe("http://x/cardio/parse");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ fitBase64: "QUJD" });
});

test("parseFitCardio lanza el mensaje del backend en 400", async () => {
  mockFetch({ error: "No parece un archivo .FIT" }, false, 400);
  await expect(parseFitCardio("http://x", "bad")).rejects.toThrow(/No parece/);
});
