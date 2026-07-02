import { test, expect } from "bun:test";
import { TrainingProfileSchema } from "./profile";

test("acepta un perfil válido", () => {
  const profile = {
    experience: "intermediate",
    goal: "hypertrophy",
    daysPerWeek: 4,
    sessionMinutes: 60,
    gymEquipment: ["barbell", "dumbbell", "cable_machine"],
    homeEquipment: ["bodyweight", "dumbbell", "resistance_band"],
    limitations: ["dolor lumbar leve"],
  };
  const parsed = TrainingProfileSchema.parse(profile);
  expect(parsed.daysPerWeek).toBe(4);
});

test("rechaza daysPerWeek fuera de rango", () => {
  expect(() =>
    TrainingProfileSchema.parse({
      experience: "beginner",
      goal: "strength",
      daysPerWeek: 8,
      sessionMinutes: 45,
      gymEquipment: [],
      homeEquipment: ["bodyweight"],
      limitations: [],
    }),
  ).toThrow();
});

const base = {
  experience: "beginner",
  goal: "general_fitness",
  daysPerWeek: 3,
  sessionMinutes: 45,
  gymEquipment: [],
  homeEquipment: ["bodyweight"],
  limitations: [],
};

test("acepta edad/peso/altura opcionales", () => {
  const parsed = TrainingProfileSchema.parse({ ...base, age: 34, weightKg: 78.5, heightCm: 180 });
  expect(parsed.age).toBe(34);
  expect(parsed.weightKg).toBe(78.5);
  expect(parsed.heightCm).toBe(180);
});

test("son opcionales: valida sin ellos", () => {
  const parsed = TrainingProfileSchema.parse(base);
  expect(parsed.age).toBeUndefined();
});

test("rechaza edad fuera de rango", () => {
  expect(() => TrainingProfileSchema.parse({ ...base, age: 5 })).toThrow();
});
