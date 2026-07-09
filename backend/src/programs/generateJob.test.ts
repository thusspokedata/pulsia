import { test, expect } from "bun:test";
import { runGenerationJob } from "./generateJob";

const profile: any = { experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45, gymEquipment: ["barbell"], homeEquipment: ["bodyweight"], limitations: [] };
const program = { name: "Plan", weeks: [{ weekNumber: 1, workouts: [{ dayLabel: "D1", location: "gym", focus: "chest", exercises: [{ catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 3, reps: "8-10", targetLoad: "RPE 7", restSeconds: 90, notes: "" }] }] }] };

// fakeDb que registra el update del job y sirve datos mínimos.
function fakeDb() {
  const updates: any[] = [];
  const inserted = [{ id: "prog-1" }];
  return {
    _updates: updates,
    query: { workoutSession: { findMany: async () => [] }, athleteMemory: { findFirst: async () => null } },
    insert: () => ({ values: () => ({ returning: async () => inserted, onConflictDoUpdate: async () => {} }) }),
    update: () => ({ set: (v: any) => ({ where: async () => { updates.push(v); } }) }),
  } as any;
}
const deps = (ai: any) => ({ db: fakeDb(), config: { encryptionKey: "a".repeat(64), defaultModel: "m" }, aiClient: ai } as any);

test("éxito: marca el job done con el programId", async () => {
  const d = deps({ generateProgram: async () => program, updateMemory: async () => "m2" });
  await runGenerationJob(d, "job-1", "u1", profile, "sk", "m");
  expect(d.db._updates.some((u: any) => u.status === "done" && u.programId === "prog-1")).toBe(true);
});

test("error de IA: marca el job error", async () => {
  const d = deps({ generateProgram: async () => { throw new Error("IA caída"); }, updateMemory: async () => "m2" });
  await runGenerationJob(d, "job-1", "u1", profile, "sk", "m");
  expect(d.db._updates.some((u: any) => u.status === "error" && typeof u.error === "string")).toBe(true);
});
