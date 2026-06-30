import { test, expect } from "bun:test";
import { ProgramSchema } from "./program";

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
            focus: "chest",
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
      weeks: [{ weekNumber: 1, workouts: [{ dayLabel: "d", location: "park", focus: "back", exercises: [] }] }],
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
      weeks: [{ weekNumber: 1, workouts: [{ dayLabel: "d", location: "gym", focus: "chest", exercises: [
        { catalogId: "", garminName: "Barbell Bench Press", sets: 3, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90, notes: "" },
      ] }] }],
    }),
  ).toThrow();
});
