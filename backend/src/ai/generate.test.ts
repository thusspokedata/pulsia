import { test, expect } from "bun:test";
import { generateProgramForProfile, AUTO_ADJUST_RATIONALE } from "./generate";
import type { AiClient } from "./client";
import type { Program, TrainingProfile } from "@pulsia/shared";

const profile: TrainingProfile = {
  experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45,
  gymEquipment: ["barbell", "bench"], homeEquipment: ["bodyweight"], limitations: [],
};

const validProgram: Program = {
  name: "Plan", weeks: [{ weekNumber: 1, workouts: [
    { dayLabel: "D1", location: "gym", targetMuscles: ["chest"], exercises: [
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

// Día con ejercicio de pierna en objetivo de espalda/bíceps.
const programBadDay: Program = {
  name: "Plan", weeks: [{ weekNumber: 1, workouts: [
    { dayLabel: "Espalda y Bíceps", location: "gym", targetMuscles: ["back", "biceps"], exercises: [
      { catalogId: "barbell_row", garminName: "Barbell Row", sets: 3, reps: "8", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
      { catalogId: "barbell_front_squat", garminName: "Barbell Front Squat", sets: 3, reps: "8", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
    ] },
  ] }],
};
const repairedDayProgram: Program = {
  name: "Reparado", weeks: [{ weekNumber: 1, workouts: [
    { dayLabel: "x", location: "gym", targetMuscles: ["back", "biceps"], exercises: [
      { catalogId: "barbell_row", garminName: "Barbell Row", sets: 3, reps: "8", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
    ] },
  ] }],
};

test("Fase B: programa sin días fuera de objetivo → cero reparaciones", async () => {
  let repairs = 0;
  const ai: AiClient = { generateProgram: async (input) => { if (input.oneOff) { repairs++; return repairedDayProgram; } return validProgram; } };
  const result = await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai });
  expect(repairs).toBe(0);
  expect(result).toEqual(validProgram);
});

test("Fase B: un día malo → 1 reparación; reemplaza ejercicios y preserva metadatos del día", async () => {
  let repairs = 0;
  const badDay: Program = JSON.parse(JSON.stringify(programBadDay));
  const ai: AiClient = { generateProgram: async (input) => { if (input.oneOff) { repairs++; return repairedDayProgram; } return badDay; } };
  const result = await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai });
  expect(repairs).toBe(1);
  const day = result.weeks[0].workouts[0];
  expect(day.dayLabel).toBe("Espalda y Bíceps");
  expect(day.targetMuscles).toEqual(["back", "biceps"]);
  expect(day.exercises.map((e) => e.catalogId)).toEqual(["barbell_row"]);
});

test("Fase B: un día reparado reemplaza su rationale stale por la nota de ajuste automático", async () => {
  const badDay: Program = JSON.parse(JSON.stringify(programBadDay));
  badDay.weeks[0].workouts[0].rationale = "justificación de los ejercicios ORIGINALES (ahora reemplazados)";
  const ai: AiClient = { generateProgram: async (input) => (input.oneOff ? repairedDayProgram : badDay) };
  const result = await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai });
  expect(result.weeks[0].workouts[0].rationale).toBe(AUTO_ADJUST_RATIONALE);
});

test("Fase B: un día NO reparado conserva su rationale", async () => {
  const ai: AiClient = { generateProgram: async () => {
    const withRationale: Program = JSON.parse(JSON.stringify(validProgram));
    withRationale.weeks[0].workouts[0].rationale = "porqué del día, intacto";
    return withRationale;
  } };
  const result = await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai });
  expect(result.weeks[0].workouts[0].rationale).toBe("porqué del día, intacto");
});

test("Fase B: reparación que mete un catalogId inexistente → conserva el día original", async () => {
  const badDay: Program = JSON.parse(JSON.stringify(programBadDay));
  const repairedBad: Program = JSON.parse(JSON.stringify(repairedDayProgram));
  repairedBad.weeks[0].workouts[0].exercises[0].catalogId = "no_existe";
  const ai: AiClient = { generateProgram: async (input) => (input.oneOff ? repairedBad : badDay) };
  const result = await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai });
  expect(result.weeks[0].workouts[0].exercises.map((e) => e.catalogId)).toEqual(["barbell_row", "barbell_front_squat"]);
});

test("Fase B: reparación válida pero AÚN fuera de objetivo → conserva el día original", async () => {
  const badDay: Program = JSON.parse(JSON.stringify(programBadDay));
  // la reparación devuelve un ejercicio de pierna (quads), válido pero fuera de [back,biceps]
  const repairedStillBad: Program = {
    name: "Reparado", weeks: [{ weekNumber: 1, workouts: [
      { dayLabel: "x", location: "gym", targetMuscles: ["back", "biceps"], exercises: [
        { catalogId: "barbell_front_squat", garminName: "Barbell Front Squat", sets: 3, reps: "8", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
      ] },
    ] }],
  };
  const ai: AiClient = { generateProgram: async (input) => (input.oneOff ? repairedStillBad : badDay) };
  const result = await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai });
  // no se acepta la reparación fuera de objetivo → queda el día original (2 ejercicios)
  expect(result.weeks[0].workouts[0].exercises.map((e) => e.catalogId)).toEqual(["barbell_row", "barbell_front_squat"]);
});

test("Fase B: si la reparación lanza (error IA) → conserva el día original, no falla la generación", async () => {
  const badDay: Program = JSON.parse(JSON.stringify(programBadDay));
  const ai: AiClient = { generateProgram: async (input) => { if (input.oneOff) throw new Error("IA caída"); return badDay; } };
  const result = await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai });
  expect(result.weeks[0].workouts[0].exercises.length).toBe(2);
});

test("generateProgramForProfile pasa el workObjective al cliente", async () => {
  let seen: any = null;
  const ai: AiClient = {
    generateProgram: async (input: any) => { seen = input; return { name: "P", rationale: "g", weeks: [] }; },
  };
  await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai, workObjective: "mi norte" });
  expect(seen.workObjective).toBe("mi norte");
});

test("Fase B: no corre para generaciones oneOff (el pedido ya fija el objetivo)", async () => {
  let calls = 0;
  const badDay: Program = JSON.parse(JSON.stringify(programBadDay));
  const ai: AiClient = { generateProgram: async () => { calls++; return badDay; } };
  await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai, oneOff: { location: "gym", focus: ["back"], sessionMinutes: 60, equipment: [] } });
  expect(calls).toBe(1);
});
