import { test, expect } from "bun:test";
import { generateProgramForProfile } from "./generate";
import type { AiClient } from "./client";
import type { Program, TrainingProfile } from "@pulsia/shared";

const profile: TrainingProfile = {
  experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45,
  gymEquipment: ["barbell", "bench"], homeEquipment: ["bodyweight"], limitations: [],
};

const validProgram: Program = {
  name: "Plan", weeks: [{ weekNumber: 1, workouts: [
    { dayLabel: "D1", location: "gym", focus: "chest", exercises: [
      { catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 3, reps: "8-10", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
    ] },
  ] }],
};

test("devuelve el programa cuando es válido y usa catalogIds reales", async () => {
  const ai: AiClient = { generateProgram: async () => validProgram };
  const result = await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai });
  expect(result.name).toBe("Plan");
});

test("reintenta una vez si hay un catalogId inexistente, y luego acepta el válido", async () => {
  let call = 0;
  const bad: Program = JSON.parse(JSON.stringify(validProgram));
  bad.weeks[0].workouts[0].exercises[0].catalogId = "no_existe";
  const ai: AiClient = { generateProgram: async () => (call++ === 0 ? bad : validProgram) };
  const result = await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai });
  expect(call).toBe(2);
  expect(result.name).toBe("Plan");
});

test("lanza si tras el retry sigue habiendo catalogId inexistente", async () => {
  const bad: Program = JSON.parse(JSON.stringify(validProgram));
  bad.weeks[0].workouts[0].exercises[0].catalogId = "no_existe";
  const ai: AiClient = { generateProgram: async () => bad };
  await expect(generateProgramForProfile({ profile, apiKey: "k", model: "m", ai })).rejects.toThrow();
});
