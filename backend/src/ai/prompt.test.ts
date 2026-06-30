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
