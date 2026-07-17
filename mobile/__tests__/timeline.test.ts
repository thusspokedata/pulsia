import { buildTimeline } from "../src/session/timeline";

const session = (id: string, startedAt: number) => ({
  id, programId: "p", dayLabel: "Día 1", location: "gym" as const,
  startedAt, totalDurationMs: 3600000, completionPct: 100, avgHr: null,
});
const cardio = (id: string, startedAt: number) => ({
  id, type: "walk" as const, startedAt, durationMs: 1800000, distanceM: 2000,
  avgHr: null, maxHr: null, elevationGainM: null, kcal: null,
  kcalSource: "estimate" as const, source: "manual" as const, notes: "",
});

test("mergea ambas fuentes ordenadas por startedAt desc", () => {
  const t = buildTimeline([session("s1", 1000), session("s2", 3000)], [cardio("c1", 2000)]);
  expect(t.map((i) => i.id)).toEqual(["s2", "c1", "s1"]);
});

test("cada ítem lleva su discriminante kind", () => {
  const t = buildTimeline([session("s1", 1000)], [cardio("c1", 2000)]);
  expect(t.find((i) => i.id === "c1")!.kind).toBe("cardio");
  expect(t.find((i) => i.id === "s1")!.kind).toBe("session");
});

test("listas vacías → []", () => {
  expect(buildTimeline([], [])).toEqual([]);
});

test("solo cardio, sin sesiones", () => {
  const t = buildTimeline([], [cardio("c1", 5000), cardio("c2", 1000)]);
  expect(t.map((i) => i.id)).toEqual(["c1", "c2"]);
});
