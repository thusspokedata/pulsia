import { test, expect } from "bun:test";
import { TrainingProfileSchema, ageFromBirthDate, profileWithDerivedAge, isTrainingEnabled } from "./profile";

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

test("acepta el objetivo recomposition (preset del owner: bajar grasa + subir músculo)", () => {
  expect(TrainingProfileSchema.parse({ ...base, goal: "recomposition" }).goal).toBe("recomposition");
  expect(TrainingProfileSchema.safeParse({ ...base, goal: "inventado" }).success).toBe(false);
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

// --- birthDate (PERF-1 #3): guardar la fecha y derivar la edad para que se actualice sola ---

test("acepta birthDate en formato ISO y lo deja opcional", () => {
  expect(TrainingProfileSchema.parse({ ...base, birthDate: "1990-05-14" }).birthDate).toBe("1990-05-14");
  expect(TrainingProfileSchema.parse(base).birthDate).toBeUndefined();
});

test("rechaza birthDate mal formado o con fecha imposible", () => {
  expect(TrainingProfileSchema.safeParse({ ...base, birthDate: "14/05/1990" }).success).toBe(false);
  expect(TrainingProfileSchema.safeParse({ ...base, birthDate: "1990-13-01" }).success).toBe(false); // mes 13
  expect(TrainingProfileSchema.safeParse({ ...base, birthDate: "1990-02-30" }).success).toBe(false); // 30 feb
  expect(TrainingProfileSchema.safeParse({ ...base, birthDate: "2200-01-01" }).success).toBe(false); // edad imposible
});

test("ageFromBirthDate calcula años cumplidos según la fecha 'ahora'", () => {
  const now = Date.UTC(2026, 4, 14); // 14-05-2026
  expect(ageFromBirthDate("1990-05-14", now)).toBe(36); // justo cumple hoy
  expect(ageFromBirthDate("1990-05-15", now)).toBe(35); // cumple mañana → todavía 35
  expect(ageFromBirthDate("1990-05-13", now)).toBe(36); // cumplió ayer
  expect(ageFromBirthDate("no-es-fecha", now)).toBeUndefined();
});

test("ageFromBirthDate se corre solo: mismo nacimiento, distinto 'ahora'", () => {
  expect(ageFromBirthDate("2000-01-01", Date.UTC(2025, 5, 1))).toBe(25);
  expect(ageFromBirthDate("2000-01-01", Date.UTC(2026, 5, 1))).toBe(26); // un año después
});

test("profileWithDerivedAge pisa age con la derivada de birthDate", () => {
  const p = TrainingProfileSchema.parse({ ...base, birthDate: "1990-05-14", age: 20 /* viejo/desactualizado */ });
  const withAge = profileWithDerivedAge(p, Date.UTC(2026, 4, 14));
  expect(withAge.age).toBe(36); // derivada de birthDate, no el 20 guardado
});

test("profileWithDerivedAge deja el perfil intacto si no hay birthDate (fallback a age)", () => {
  const p = TrainingProfileSchema.parse({ ...base, age: 42 });
  const out = profileWithDerivedAge(p, Date.UTC(2026, 4, 14));
  expect(out.age).toBe(42);
  expect(out.birthDate).toBeUndefined();
});
