import { test, expect } from "bun:test";
import { buildWorkObjectiveDraftPrompt } from "./objective";

const profile = {
  experience: "intermediate", goal: "recomposition", daysPerWeek: 4, sessionMinutes: 60,
  gymEquipment: [], homeEquipment: [], limitations: [],
} as any;

test("incluye objetivo de entrenamiento, nutricional y memoria", () => {
  const p = buildWorkObjectiveDraftPrompt({
    profile, memory: "no tiene barra; molestia en hombro",
    nutritionObjective: "lose",
  });
  expect(p).toContain("recomposition");
  expect(p).toContain("lose");
  expect(p).toContain("molestia en hombro");
});

test("memoria vacía no rompe", () => {
  const p = buildWorkObjectiveDraftPrompt({ profile, memory: "", nutritionObjective: "maintain" });
  expect(typeof p).toBe("string");
  expect(p.length).toBeGreaterThan(0);
});
