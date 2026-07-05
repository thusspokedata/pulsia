import { test, expect } from "bun:test";
import { buildOneOffPrompt } from "./oneoff";
import type { TrainingProfile } from "@pulsia/shared";

const profile: TrainingProfile = {
  experience: "intermediate", goal: "hypertrophy", daysPerWeek: 4, sessionMinutes: 60,
  gymEquipment: ["barbell", "dumbbell", "bench"], homeEquipment: ["dumbbell"], limitations: [],
} as TrainingProfile;

test("pide UN entreno del músculo y location elegidos, sin progresión", () => {
  const p = buildOneOffPrompt(profile, { location: "home", focus: "chest" });
  expect(p.toLowerCase()).toContain("un entrenamiento");
  expect(p).toContain("chest");
  expect(p.toLowerCase()).toContain("casa");
  expect(p.toLowerCase()).not.toContain("progresión");
});

test("usa solo el equipo de la location (home → homeEquipment: dumbbell)", () => {
  const p = buildOneOffPrompt(profile, { location: "home", focus: "chest" });
  expect(p).toContain("dumbbell");
});
