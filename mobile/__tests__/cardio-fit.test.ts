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

import { buildFitActivity } from "../src/cardio/buildFitActivity";
import type { CardioFitPreview } from "@pulsia/shared";

const preview: CardioFitPreview = {
  type: "walk", startedAt: 1_700_000_000_000, durationMs: 1_800_000,
  distanceM: 2500, avgHr: 110, maxHr: 130, elevationGainM: 12, kcal: 150,
  hrSeries: [{ t: 0, bpm: 108 }],
};

test("buildFitActivity arrastra los campos device y usa el form para lo editable", () => {
  const a = buildFitActivity(
    preview,
    { type: "run", durationMs: 1_800_000, distanceM: 2500, avgHr: 110, notes: "corregí el tipo" },
    "11111111-1111-1111-1111-111111111111",
  );
  expect(a.source).toBe("fit");
  expect(a.type).toBe("run"); // del form (usuario corrigió)
  expect(a.startedAt).toBe(1_700_000_000_000); // del preview
  expect(a.kcal).toBe(150);
  expect(a.kcalSource).toBe("device"); // hay kcal + source fit
  expect(a.maxHr).toBe(130);
  expect(a.hrSeries).toEqual([{ t: 0, bpm: 108 }]);
  expect(a.notes).toBe("corregí el tipo");
});

test("buildFitActivity marca estimate cuando el .FIT no trae kcal", () => {
  const a = buildFitActivity(
    { ...preview, kcal: null },
    { type: "walk", durationMs: 1_800_000, distanceM: null, avgHr: null, notes: "" },
    "22222222-2222-2222-2222-222222222222",
  );
  expect(a.kcal).toBeNull();
  expect(a.kcalSource).toBe("estimate");
});
