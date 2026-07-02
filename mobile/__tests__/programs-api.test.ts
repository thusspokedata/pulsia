import { generateProgram, GenerationError } from "../src/api/programs";
import type { TrainingProfile } from "@pulsia/shared";

const URL = "http://backend.test";
const profile: TrainingProfile = {
  experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45,
  gymEquipment: ["barbell", "bench"], homeEquipment: ["bodyweight"], limitations: [],
};
const validProgram = { name: "Plan", weeks: [{ weekNumber: 1, workouts: [] }] };

afterEach(() => { (global.fetch as any) = undefined; });

test("devuelve el programa en éxito", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "p1", program: validProgram }) }) as any;
  const res = await generateProgram(URL, profile);
  expect(res.program.name).toBe("Plan");
});

test("lanza GenerationError con code noApiKey en 400", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "No hay API key" }) }) as any;
  await expect(generateProgram(URL, profile)).rejects.toMatchObject({ code: "noApiKey" });
});

test("lanza GenerationError con code aiError en 502", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: "fuera del catálogo" }) }) as any;
  await expect(generateProgram(URL, profile)).rejects.toMatchObject({ code: "aiError" });
});

test("timeout (AbortError) da code timeout, no network", async () => {
  const abort = Object.assign(new Error("Aborted"), { name: "AbortError" });
  global.fetch = jest.fn().mockRejectedValue(abort) as any;
  await expect(generateProgram(URL, profile)).rejects.toMatchObject({ code: "timeout" });
});

test("fallo de red real da code network", async () => {
  global.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed")) as any;
  await expect(generateProgram(URL, profile)).rejects.toMatchObject({ code: "network" });
});
