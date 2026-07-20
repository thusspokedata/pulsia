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

// Regresión: la Fase 1 capturaba samples/fitExtras/escalares y buildFitActivity los descartaba en
// silencio, así que llegaban NULL a la base aunque el backend los parseara bien. Los tests de cada
// pieza estaban en verde; faltaba justamente éste, el del camino preview → actividad.
// Es estructural a propósito: si el preview gana un campo y nadie lo propaga, este test falla solo.
test("buildFitActivity propaga TODOS los campos del preview (ninguno se pierde)", () => {
  const preview: CardioFitPreview = {
    type: "elliptical",
    startedAt: 1784000000000,
    durationMs: 1800000,
    distanceM: 0,
    avgHr: 150,
    maxHr: 170,
    elevationGainM: 0,
    kcal: 300,
    hrSeries: [{ t: 0, bpm: 120 }],
    totalCycles: 1500,
    trainingLoad: 90.5,
    trainingEffectAerobic: 3.5,
    trainingEffectAnaerobic: 0.5,
    avgCadence: 50,
    maxCadence: 70,
    avgFractionalCadence: 0.5,
    avgRespiration: 30,
    maxRespiration: 35,
    minRespiration: 25,
    metabolicKcal: 40,
    sportProfileName: "Elíptica",
    tzOffsetMinutes: -120,
    samples: { t: [0, 1000], hr: [120, 125], cad: [50, 51] },
    fitExtras: { zones: { secondsPerZone: [0, 100], highBoundary: [120, 140], maxHr: 190, restingHr: 50, thresholdHr: 170, calcType: "percent" } },
  };
  const form = { type: "elliptical" as const, durationMs: 1800000, distanceM: 0, avgHr: 150, notes: "" };
  const a: Record<string, unknown> = buildFitActivity(preview, form, "11111111-1111-4111-8111-111111111111") as unknown as Record<string, unknown>;

  // El form pisa estos a propósito; el resto del preview debe sobrevivir intacto.
  const pisadosPorElForm = new Set(["type", "durationMs", "distanceM", "avgHr"]);
  const perdidos = Object.keys(preview).filter(
    (k) => !pisadosPorElForm.has(k) && a[k] === undefined,
  );
  expect(perdidos).toEqual([]);

  // Y un par de valores concretos, para que no alcance con setear la clave en undefined.
  expect(a.samples).toEqual(preview.samples);
  expect(a.fitExtras).toEqual(preview.fitExtras);
  expect(a.totalCycles).toBe(1500);
  expect(a.tzOffsetMinutes).toBe(-120);
});
