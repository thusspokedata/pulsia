import { generateProgram, generateOneOff, startGeneration, getGenerationStatus, GenerationError } from "../src/api/programs";
import type { TrainingProfile } from "@pulsia/shared";

const URL = "http://backend.test";
const profile: TrainingProfile = {
  experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45,
  gymEquipment: ["barbell", "bench"], homeEquipment: ["bodyweight"], limitations: [],
};
const validProgram = { name: "Plan", weeks: [{ weekNumber: 1, workouts: [] }] };
const validOneOffProgram = {
  name: "Entreno puntual",
  weeks: [{ weekNumber: 1, workouts: [
    { dayLabel: "D1", location: "home", focus: "chest", exercises: [
      { catalogId: "pushup", garminName: "Push Up", sets: 3, reps: "10-12", targetLoad: "RPE 7", restSeconds: 60, notes: "" },
    ] },
  ] }],
};

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

test("generateOneOff postea a /programs/generate-oneoff y devuelve el programa parseado", async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: "oneoff-1", program: validOneOffProgram }),
  });
  global.fetch = fetchMock as any;

  const args = {
    profile,
    location: "home" as const,
    focus: ["chest"],
    sessionMinutes: 45,
    equipment: ["bodyweight"],
  };
  const res = await generateOneOff(URL, args);

  expect(fetchMock).toHaveBeenCalledWith(
    `${URL}/programs/generate-oneoff`,
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify(args),
    }),
  );
  expect(res.id).toBe("oneoff-1");
  expect(res.program).toEqual(validOneOffProgram);
});

test("generateOneOff lanza error si la respuesta no es ok", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }) as any;
  await expect(
    generateOneOff(URL, {
      profile,
      location: "home",
      focus: ["chest"],
      sessionMinutes: 45,
      equipment: ["bodyweight"],
    }),
  ).rejects.toThrow("No se pudo generar el entreno puntual");
});

test("startGeneration postea a generate-async y devuelve el jobId", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ jobId: "job-1" }) });
  global.fetch = fetchMock as any;
  const res = await startGeneration(URL, profile);
  expect(fetchMock).toHaveBeenCalledWith(
    `${URL}/programs/generate-async`,
    expect.objectContaining({ method: "POST", body: JSON.stringify(profile) }),
  );
  expect(res).toEqual({ jobId: "job-1" });
});

test("startGeneration lanza GenerationError code noApiKey en 400", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "no key" }) }) as any;
  await expect(startGeneration(URL, profile)).rejects.toMatchObject({ code: "noApiKey" });
});

test("startGeneration lanza GenerationError code aiError en 500", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as any;
  await expect(startGeneration(URL, profile)).rejects.toMatchObject({ code: "aiError" });
});

test("startGeneration convierte un fallo de red en GenerationError code network", async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error("boom")) as any;
  await expect(startGeneration(URL, profile)).rejects.toMatchObject({ code: "network" });
});

test("getGenerationStatus devuelve pending", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: "pending" }) }) as any;
  const res = await getGenerationStatus(URL, "job-1");
  expect(res).toEqual({ status: "pending" });
});

test("getGenerationStatus devuelve done con el programa parseado", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status: "done", programId: "p1", program: validProgram }),
  }) as any;
  const res = await getGenerationStatus(URL, "job-1");
  expect(res).toEqual({ status: "done", programId: "p1", program: validProgram });
});

test("getGenerationStatus devuelve error con el mensaje", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: "error", error: "IA caída" }) }) as any;
  const res = await getGenerationStatus(URL, "job-1");
  expect(res).toEqual({ status: "error", error: "IA caída" });
});

test("getGenerationStatus convierte un fallo de red en GenerationError code network", async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error("boom")) as any;
  await expect(getGenerationStatus(URL, "job-1")).rejects.toMatchObject({ code: "network" });
});

test("getGenerationStatus lanza GenerationError code invalid si el programa en done es inválido", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status: "done", programId: "p1", program: { name: 123 } }),
  }) as any;
  await expect(getGenerationStatus(URL, "job-1")).rejects.toMatchObject({ code: "invalid" });
});
