import { test, expect } from "bun:test";
import { migrateLegacyProgramShape } from "./programMigration";
import { ProgramSchema } from "./program";

const legacy = {
  name: "Plan",
  weeks: [{ weekNumber: 1, workouts: [
    { dayLabel: "D1", location: "gym", focus: "chest", exercises: [
      { catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 3, reps: "8-10", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
    ] },
  ] }],
};

test("mapea focus (string) → targetMuscles [focus] en workouts legacy", () => {
  const out = migrateLegacyProgramShape(legacy) as any;
  expect(out.weeks[0].workouts[0].targetMuscles).toEqual(["chest"]);
});

test("un programa legacy migrado pasa ProgramSchema", () => {
  const parsed = ProgramSchema.safeParse(migrateLegacyProgramShape(legacy));
  expect(parsed.success).toBe(true);
});

test("no toca workouts que ya tienen targetMuscles", () => {
  const modern = { name: "P", weeks: [{ weekNumber: 1, workouts: [{ dayLabel: "D", location: "gym", targetMuscles: ["back", "biceps"], exercises: [] }] }] };
  const out = migrateLegacyProgramShape(modern) as any;
  expect(out.weeks[0].workouts[0].targetMuscles).toEqual(["back", "biceps"]);
  expect(out.weeks[0].workouts[0].focus).toBeUndefined();
});

test("entrada malformada / no-objeto no lanza y se devuelve tal cual", () => {
  expect(migrateLegacyProgramShape(null)).toBe(null);
  expect(migrateLegacyProgramShape("x")).toBe("x");
  expect(migrateLegacyProgramShape({ weeks: "nope" })).toEqual({ weeks: "nope" });
});

test("no muta la entrada original", () => {
  const input = JSON.parse(JSON.stringify(legacy));
  migrateLegacyProgramShape(input);
  expect(input.weeks[0].workouts[0].focus).toBe("chest");
  expect(input.weeks[0].workouts[0].targetMuscles).toBeUndefined();
});
