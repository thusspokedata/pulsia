import { test, expect } from "bun:test";
import { TrainingProfileSchema, isTrainingEnabled } from "./profile";

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

test("sex es opcional y valida el enum", () => {
  expect(TrainingProfileSchema.safeParse({ ...base, sex: "female" }).success).toBe(true);
  expect(TrainingProfileSchema.safeParse({ ...base }).success).toBe(true);
  expect(TrainingProfileSchema.safeParse({ ...base, sex: "otro" }).success).toBe(false);
});

// --- trainingEnabled (PERF-1 #1): modo "solo seguimiento" para quien no quiere entrenar ---

test("trainingEnabled ausente se considera activado (back-compat)", () => {
  const p = TrainingProfileSchema.parse(base); // perfiles viejos no tienen el campo
  expect(p.trainingEnabled).toBeUndefined();
  expect(isTrainingEnabled(p)).toBe(true);
});

test("con trainingEnabled=false, días/min son opcionales (solo seguimiento)", () => {
  const parsed = TrainingProfileSchema.safeParse({
    experience: "beginner", goal: "general_fitness", trainingEnabled: false,
    gymEquipment: [], homeEquipment: [], limitations: [],
  });
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(isTrainingEnabled(parsed.data)).toBe(false);
});

test("con entrenamiento activado, días/min siguen siendo obligatorios", () => {
  const parsed = TrainingProfileSchema.safeParse({
    experience: "beginner", goal: "general_fitness", trainingEnabled: true,
    gymEquipment: [], homeEquipment: [], limitations: [],
  }); // faltan daysPerWeek/sessionMinutes
  expect(parsed.success).toBe(false);
});

test("acepta activityLevel y lo deja opcional", () => {
  const base = { experience: "beginner", goal: "strength", daysPerWeek: 3, sessionMinutes: 45, gymEquipment: [], homeEquipment: ["bodyweight"], limitations: [] };
  expect(TrainingProfileSchema.parse({ ...base, activityLevel: "moderate" }).activityLevel).toBe("moderate");
  expect(TrainingProfileSchema.parse(base).activityLevel).toBeUndefined();
  expect(TrainingProfileSchema.safeParse({ ...base, activityLevel: "extreme" }).success).toBe(false);
});
