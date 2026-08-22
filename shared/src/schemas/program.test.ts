import { test, expect } from "bun:test";
import { ProgramSchema, ProgramGenerationSchema } from "./program";

test("acepta un programa válido de 1 semana", () => {
  const program = {
    name: "Hipertrofia 4 días",
    weeks: [
      {
        weekNumber: 1,
        workouts: [
          {
            dayLabel: "Día 1 - Empuje",
            location: "gym",
            targetMuscles: ["chest"],
            exercises: [
              {
                catalogId: "barbell_bench_press",
                garminName: "Barbell Bench Press",
                sets: 4,
                reps: "8-10",
                targetLoad: "RPE 8",
                restSeconds: 120,
                notes: "",
              },
            ],
          },
        ],
      },
    ],
  };
  const parsed = ProgramSchema.parse(program);
  expect(parsed.weeks[0].workouts[0].location).toBe("gym");
});

test("rechaza location inválida", () => {
  expect(() =>
    ProgramSchema.parse({
      name: "x",
      weeks: [{ weekNumber: 1, workouts: [{ dayLabel: "d", location: "park", targetMuscles: ["back"], exercises: [] }] }],
    }),
  ).toThrow();
});

test("rechaza name vacío", () => {
  expect(() =>
    ProgramSchema.parse({
      name: "",
      weeks: [{ weekNumber: 1, workouts: [] }],
    }),
  ).toThrow();
});

test("rechaza catalogId vacío en un ejercicio", () => {
  expect(() =>
    ProgramSchema.parse({
      name: "Plan",
      weeks: [{ weekNumber: 1, workouts: [{ dayLabel: "d", location: "gym", targetMuscles: ["chest"], exercises: [
        { catalogId: "", garminName: "Barbell Bench Press", sets: 3, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90, notes: "" },
      ] }] }],
    }),
  ).toThrow();
});

const day = { dayLabel: "D1", location: "gym", targetMuscles: ["back"], exercises: [] };

test("ProgramSchema acepta programas viejos SIN rationale", () => {
  const r = ProgramSchema.safeParse({ name: "P", weeks: [{ weekNumber: 1, workouts: [day] }] });
  expect(r.success).toBe(true);
});

test("ProgramSchema acepta rationale opcional", () => {
  const r = ProgramSchema.safeParse({ name: "P", rationale: "porqué global", weeks: [{ weekNumber: 1, workouts: [{ ...day, rationale: "porqué del día" }] }] });
  expect(r.success).toBe(true);
});

test("ProgramGenerationSchema EXIGE rationale global y por día", () => {
  const sinRat = ProgramGenerationSchema.safeParse({ name: "P", weeks: [{ weekNumber: 1, workouts: [day] }] });
  expect(sinRat.success).toBe(false);
  const conRat = ProgramGenerationSchema.safeParse({ name: "P", rationale: "g", weeks: [{ weekNumber: 1, workouts: [{ ...day, rationale: "d" }] }] });
  expect(conRat.success).toBe(true);
});

test("ProgramGenerationSchema EXIGE rationale por día aunque el global esté", () => {
  const r = ProgramGenerationSchema.safeParse({
    name: "P", rationale: "global presente",
    weeks: [{ weekNumber: 1, workouts: [day] }], // day SIN rationale
  });
  expect(r.success).toBe(false);
});

test("ProgramGenerationSchema rechaza rationale global whitespace-only", () => {
  const r = ProgramGenerationSchema.safeParse({
    name: "P", rationale: "   ",
    weeks: [{ weekNumber: 1, workouts: [{ ...day, rationale: "d" }] }],
  });
  expect(r.success).toBe(false);
});

test("ProgramGenerationSchema rechaza rationale de día whitespace-only", () => {
  const r = ProgramGenerationSchema.safeParse({
    name: "P", rationale: "g",
    weeks: [{ weekNumber: 1, workouts: [{ ...day, rationale: "   " }] }],
  });
  expect(r.success).toBe(false);
});
