import { test, expect } from "bun:test";
import { buildOneOffPrompt } from "./oneoff";
import type { TrainingProfile } from "@pulsia/shared";

const profile: TrainingProfile = {
  experience: "intermediate", goal: "hypertrophy", daysPerWeek: 4, sessionMinutes: 60,
  gymEquipment: ["barbell", "dumbbell", "bench"], homeEquipment: ["dumbbell"], limitations: [],
} as TrainingProfile;

test("pide UN entreno, sin progresión", () => {
  const p = buildOneOffPrompt(profile, {
    location: "home", focus: ["chest"], sessionMinutes: 60, equipment: ["dumbbell"],
  });
  // La frase de la tarea, no el eco de la regla 4 ("Es un entrenamiento de un único día").
  expect(p).toContain("Diseñá UN ENTRENAMIENTO de un solo día");
  expect(p.toLowerCase()).toContain("casa");
  expect(p.toLowerCase()).not.toContain("progresión");
});

test("incluye TODOS los músculos pedidos", () => {
  const p = buildOneOffPrompt(profile, {
    location: "gym", focus: ["chest", "triceps", "shoulders"], sessionMinutes: 60, equipment: ["dumbbell"],
  });
  // Anclado a la línea del pedido: los nombres sueltos los ecoa el catálogo de ejercicios,
  // así que el `focus` podía no llegar al prompt y los 3 toContain seguían pasando.
  expect(p).toContain("grupos musculares: chest, triceps, shoulders");
});

test("usa el equipo explícito para armar el catálogo (dumbbell), no el del profile", () => {
  const p = buildOneOffPrompt(profile, {
    location: "gym", focus: ["chest"], sessionMinutes: 60, equipment: ["dumbbell"],
  });
  expect(p).toContain("dumbbell");
  // No debería incluir un ejercicio que exige barbell (equipo no disponible)
  expect(p).not.toContain("barbell_bench_press");
});

test("si equipment viene vacío, cae al equipo del location", () => {
  const p = buildOneOffPrompt(profile, {
    location: "home", focus: ["chest"], sessionMinutes: 60, equipment: [],
  });
  // homeEquipment = ["dumbbell"] → algún ejercicio de dumbbell en el catálogo
  expect(p).toContain("dumbbell");
});

test("usa los minutos override en el prompt", () => {
  const p = buildOneOffPrompt(profile, {
    location: "gym", focus: ["chest"], sessionMinutes: 30, equipment: ["dumbbell"],
  });
  expect(p).toContain("30");
});

test("incluye las notas del atleta cuando existen", () => {
  const p = buildOneOffPrompt(profile, {
    location: "gym", focus: ["chest"], sessionMinutes: 60, equipment: ["dumbbell"],
    notes: "no puedo hacer burpees",
  });
  expect(p.toLowerCase()).toContain("notas del atleta");
  expect(p).toContain("no puedo hacer burpees");
});

test("sin notas, no incluye la sección de notas", () => {
  const p = buildOneOffPrompt(profile, {
    location: "gym", focus: ["chest"], sessionMinutes: 60, equipment: ["dumbbell"],
  });
  expect(p.toLowerCase()).not.toContain("notas del atleta");
});
