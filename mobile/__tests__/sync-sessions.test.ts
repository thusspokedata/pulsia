import AsyncStorage from "@react-native-async-storage/async-storage";
import { enqueueSession, getPendingSessions } from "../src/storage/pendingSessions";
import { syncPending } from "../src/sync/syncSessions";
import type { WorkoutSession } from "@pulsia/shared";

const URL = "http://backend.test";
const mk = (id: string) => ({
  id, programId: "22222222-2222-4222-8222-222222222222", weekNumber: 1, dayLabel: "Día 1",
  location: "gym", startedAt: 1000, endedAt: 2000, totalDurationMs: 1000, notes: "", exercises: [],
}) as WorkoutSession;

beforeEach(async () => { await AsyncStorage.clear(); });
afterEach(() => { (global.fetch as any) = undefined; });

test("syncPending sube cada pendiente y vacía la cola en éxito", async () => {
  await enqueueSession(mk("11111111-1111-4111-8111-111111111111"));
  await enqueueSession(mk("33333333-3333-4333-8333-333333333333"));
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }) as any;
  const r = await syncPending(URL);
  expect(r.synced).toBe(2);
  expect(r.remaining).toBe(0);
  expect(r.lastError).toBeNull();
  expect((await getPendingSessions()).length).toBe(0);
});

test("syncPending deja en la cola las que fallan y reporta lastError (reintentable)", async () => {
  await enqueueSession(mk("11111111-1111-4111-8111-111111111111"));
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as any;
  const r = await syncPending(URL);
  expect(r.synced).toBe(0);
  expect(r.remaining).toBe(1);
  expect(r.lastError?.kind).toBe("server");
  expect(r.lastError?.retryable).toBe(true);
  expect((await getPendingSessions()).length).toBe(1);
});

test("un fallo de validación (terminal) NO descarta la sesión: queda en cola con lastError", async () => {
  await enqueueSession(mk("11111111-1111-4111-8111-111111111111"));
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }) as any;
  const r = await syncPending(URL);
  expect(r.remaining).toBe(1);
  expect(r.lastError?.kind).toBe("validation");
  expect((await getPendingSessions()).length).toBe(1);
});

test("mezcla: sube la buena, deja la mala", async () => {
  await enqueueSession(mk("11111111-1111-4111-8111-111111111111"));
  await enqueueSession(mk("33333333-3333-4333-8333-333333333333"));
  const okId = "/sessions/11111111-1111-4111-8111-111111111111";
  global.fetch = jest.fn().mockImplementation((url: string) =>
    Promise.resolve(url.endsWith(okId)
      ? { ok: true, status: 200, json: async () => ({}) }
      : { ok: false, status: 500, json: async () => ({}) })) as any;
  const r = await syncPending(URL);
  expect(r.synced).toBe(1);
  expect(r.remaining).toBe(1);
  expect((await getPendingSessions()).map((s) => s.id)).toEqual(["33333333-3333-4333-8333-333333333333"]);
});

test("dos syncPending concurrentes se serializan (nunca dos PUT en vuelo a la vez)", async () => {
  await enqueueSession(mk("11111111-1111-4111-8111-111111111111"));
  await enqueueSession(mk("33333333-3333-4333-8333-333333333333"));
  let inFlight = 0, maxInFlight = 0;
  global.fetch = jest.fn().mockImplementation(async () => {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return { ok: true, status: 200, json: async () => ({}) };
  }) as any;
  const [a, b] = await Promise.all([syncPending(URL), syncPending(URL)]);
  expect(maxInFlight).toBe(1);
  // la cola quedó vacía y no hubo doble-borrado que rompa nada
  expect((await getPendingSessions()).length).toBe(0);
  // ambos resultados son coherentes (el 1º sube las 2; el 2º encuentra 0 pendientes)
  expect(a.synced + b.synced).toBeGreaterThanOrEqual(2);
});
