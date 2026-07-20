import { buildTiles, athleteLines, fmtDuration } from "../src/cardio/activityFormat";

test("fmtDuration formatea mm:ss", () => {
  expect(fmtDuration(1844446)).toBe("30:44");
  expect(fmtDuration(65000)).toBe("1:05");
  expect(fmtDuration(0)).toBe("0:00");
});

test("buildTiles solo incluye lo que la actividad tiene", () => {
  const manual = { durationMs: 600000, kcal: 120 };
  expect(buildTiles(manual as any).map((t) => t.label)).toEqual(["Duración", "Calorías"]);
});

test("buildTiles arma los tiles del .FIT con su unidad", () => {
  const fit = {
    durationMs: 1844446, kcal: 327, avgHr: 156, maxHr: 169,
    avgCadence: 44, maxCadence: 74, totalCycles: 1680,
    trainingEffectAerobic: 3.7, trainingLoad: 103.9, avgRespiration: 34.6,
  };
  const tiles = buildTiles(fit as any);
  const byLabel = Object.fromEntries(tiles.map((t) => [t.label, t]));
  expect(byLabel["FC media"]).toMatchObject({ value: "156", unit: "ppm" });
  expect(byLabel["Ciclos totales"]).toMatchObject({ value: "1680" });
  expect(byLabel["Efecto aeróbico"]).toMatchObject({ value: "3.7", unit: "/5" });
  expect(tiles).toHaveLength(10);
});

test("un valor null NO genera tile (el reloj no lo reportó)", () => {
  expect(buildTiles({ durationMs: 1000, kcal: null, avgHr: null } as any).map((t) => t.label))
    .toEqual(["Duración"]);
});

test("athleteLines NUNCA incluye el nombre", () => {
  const athlete = { "67": "Nombre Apellido", weight: 80, height: 1.8, restingHeartRate: 55, gender: "male" };
  const text = athleteLines(athlete).map((l) => `${l.label} ${l.value}`).join(" | ");
  expect(text).not.toContain("Nombre");
  expect(text).not.toContain("Apellido");
  expect(text).toContain("80");
  expect(text).toContain("55");
});

test("athleteLines sin datos → vacío", () => {
  expect(athleteLines(undefined)).toEqual([]);
});
