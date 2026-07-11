import { test, expect } from "bun:test";
import { buildGenerationPrompt } from "./prompt";
import type { TrainingProfile } from "@pulsia/shared";

const profile: TrainingProfile = {
  experience: "intermediate",
  goal: "hypertrophy",
  daysPerWeek: 4,
  sessionMinutes: 60,
  gymEquipment: ["barbell", "dumbbell", "bench"],
  homeEquipment: ["bodyweight", "resistance_band"],
  limitations: ["dolor lumbar leve"],
};

test("el prompt incluye los parámetros del perfil", () => {
  const prompt = buildGenerationPrompt(profile);
  expect(prompt).toContain("hypertrophy");
  expect(prompt).toContain("4");
  expect(prompt).toContain("dolor lumbar leve");
});

test("el prompt solo ofrece ejercicios permitidos por el equipamiento", () => {
  const prompt = buildGenerationPrompt(profile);
  // barbell_bench_press requiere barbell+bench (disponibles) -> presente
  expect(prompt).toContain("barbell_bench_press");
});

test("incluye edad/altura cuando están presentes; el peso no se duplica en el prompt", () => {
  const prompt = buildGenerationPrompt({ ...profile, age: 34, weightKg: 78, heightCm: 180 });
  expect(prompt).toContain("Edad: 34 años");
  expect(prompt).not.toContain("- Peso:");
  expect(prompt).toContain("Altura: 180 cm");
});

test("incluye el sexo cuando está presente", () => {
  const prompt = buildGenerationPrompt({ ...profile, sex: "female" });
  expect(prompt).toContain("Sexo: femenino");
});

test("no incluye línea de sexo cuando no está", () => {
  const prompt = buildGenerationPrompt({ ...profile });
  expect(prompt).not.toContain("Sexo:");
});

test("no incluye las líneas antropométricas cuando faltan", () => {
  const prompt = buildGenerationPrompt(profile);
  expect(prompt).not.toContain("Edad:");
  expect(prompt).not.toContain("Peso:");
});

test("incluye el bloque de historial cuando se pasa historySummary", () => {
  const p = buildGenerationPrompt(profile, "2026-07-01 — Día 1 (gym)\n  - Bench: 40×10@8");
  expect(p).toContain("Historial reciente");
  expect(p).toContain("40×10@8");
});

test("sin historySummary el prompt no incluye el bloque", () => {
  const p = buildGenerationPrompt(profile);
  expect(p).not.toContain("Historial reciente");
});

test("incluye el bloque de memoria cuando se pasa memory", () => {
  const p = buildGenerationPrompt(profile, undefined, "no tiene barra; press fuerte");
  expect(p).toContain("Memoria del atleta");
  expect(p).toContain("no tiene barra");
});

test("sin memory no incluye el bloque de memoria", () => {
  const p = buildGenerationPrompt(profile);
  expect(p).not.toContain("Memoria del atleta");
});

test("buildGenerationPrompt incluye el bloque de progreso cuando se pasa", () => {
  const out = buildGenerationPrompt(profile, undefined, undefined, "Progreso medido:\n- Peso: 82 → 79 kg");
  expect(out).toContain("Progreso medido");
  expect(out).toContain("79 kg");
});

test("buildGenerationPrompt sin progreso queda intacto", () => {
  const out = buildGenerationPrompt(profile);
  expect(out).not.toContain("Progreso medido");
});
