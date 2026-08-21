import { putSession, getSessions, getSessionById, deleteSessionById } from "../src/api/sessions";
import type { WorkoutSession } from "@pulsia/shared";

const URL = "http://backend.test";
const session = {
  id: "11111111-1111-4111-8111-111111111111",
  programId: "22222222-2222-4222-8222-222222222222",
  weekNumber: 1, dayLabel: "Día 1", location: "gym",
  startedAt: 1782900000000, endedAt: 1782903600000, totalDurationMs: 3600000, notes: "",
  exercises: [],
} as WorkoutSession;

afterEach(() => { (global.fetch as any) = undefined; });

test("putSession hace PUT a /sessions/:id y resuelve en 2xx", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: session.id }) });
  global.fetch = fetchMock as any;
  await putSession(URL, session);
  const [calledUrl, init] = fetchMock.mock.calls[0];
  expect(calledUrl).toBe(`${URL}/sessions/${session.id}`);
  expect(init.method).toBe("PUT");
  expect(JSON.parse(init.body)).toMatchObject({ id: session.id });
});

test("putSession lanza si el backend responde no-ok", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }) as any;
  await expect(putSession(URL, session)).rejects.toThrow();
});

test("getSessions hace GET a /sessions y devuelve el array en 2xx", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [session] });
  global.fetch = fetchMock as any;
  const result = await getSessions(URL);
  const [calledUrl] = fetchMock.mock.calls[0];
  expect(calledUrl).toBe(`${URL}/sessions`);
  expect(result).toEqual([session]);
});

test("getSessions lanza si el backend responde no-ok", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as any;
  await expect(getSessions(URL)).rejects.toThrow("No se pudieron cargar las sesiones");
});

test("getSessionById hace GET a /sessions/:id y devuelve la sesión completa en 2xx", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => session });
  global.fetch = fetchMock as any;
  const result = await getSessionById(URL, session.id);
  const [calledUrl] = fetchMock.mock.calls[0];
  expect(calledUrl).toBe(`${URL}/sessions/${session.id}`);
  expect(result).toEqual(session);
});

test("getSessionById lanza si el backend responde no-ok", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }) as any;
  await expect(getSessionById(URL, session.id)).rejects.toThrow("No se pudo cargar la sesión");
});

test("deleteSessionById hace DELETE a /sessions/:id y resuelve en 2xx", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: session.id }) });
  global.fetch = fetchMock as any;
  await deleteSessionById(URL, session.id);
  const [calledUrl, init] = fetchMock.mock.calls[0];
  expect(calledUrl).toBe(`${URL}/sessions/${session.id}`);
  expect(init.method).toBe("DELETE");
});

test("deleteSessionById lanza si el backend responde no-ok", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }) as any;
  await expect(deleteSessionById(URL, session.id)).rejects.toThrow("No se pudo eliminar el entrenamiento");
});

// ── Import de fuerza del .FIT ─────────────────────────────────────────────────────────────────
import { previewFitStrength, importFitStrength } from "../src/api/sessions";

const strengthPreview = {
  workoutName: "Push A",
  exercises: [{ category: "shoulderPress", exerciseNameIndex: 8, displayName: "Push Press", catalogId: "dumbbell_push_press", sets: [{ reps: 8, weightKg: 20, durationMs: 30000 }] }],
  totalSets: 1, totalReps: 8, totalVolumeKg: 160,
};

test("previewFitStrength devuelve el preview en 200", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => strengthPreview });
  global.fetch = fetchMock as any;
  const r = await previewFitStrength(URL, "BASE64");
  expect(fetchMock.mock.calls[0][0]).toBe(`${URL}/sessions/from-fit/preview`);
  expect(r).toEqual(strengthPreview);
});

test("previewFitStrength devuelve null en 422 (no es fuerza → el llamador cae a cardio)", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: "no es fuerza" }) }) as any;
  expect(await previewFitStrength(URL, "BASE64")).toBeNull();
});

test("previewFitStrength lanza en un error que NO es 422", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "archivo ilegible" }) }) as any;
  await expect(previewFitStrength(URL, "BASE64")).rejects.toThrow("archivo ilegible");
});

test("importFitStrength hace POST a /sessions/from-fit con el body", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "x" }) });
  global.fetch = fetchMock as any;
  await importFitStrength(URL, { fitBase64: "B64", id: "11111111-1111-4111-8111-111111111111", location: "home" });
  const [calledUrl, init] = fetchMock.mock.calls[0];
  expect(calledUrl).toBe(`${URL}/sessions/from-fit`);
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toMatchObject({ id: "11111111-1111-4111-8111-111111111111", location: "home" });
});

test("importFitStrength lanza si el backend responde no-ok", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "falló" }) }) as any;
  await expect(importFitStrength(URL, { fitBase64: "B64", id: "x", location: "gym" })).rejects.toThrow("falló");
});

// ── SES-1: putSession mapea la respuesta a SyncError tipado ──────────────────────────────────────
test("putSession resuelve en 200", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
  await expect(putSession(URL, session)).resolves.toBeUndefined();
});

test("putSession tira SyncError('validation') en 400", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 }) as any;
  await expect(putSession(URL, session)).rejects.toMatchObject({ kind: "validation", retryable: false });
});

test("putSession tira SyncError('network') si fetch explota", async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error("Network request failed")) as any;
  await expect(putSession(URL, session)).rejects.toMatchObject({ kind: "network", retryable: true });
});
