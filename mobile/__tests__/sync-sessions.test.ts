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
  const n = await syncPending(URL);
  expect(n).toBe(2);
  expect((await getPendingSessions()).length).toBe(0);
});

test("syncPending deja en la cola las que fallan", async () => {
  await enqueueSession(mk("11111111-1111-4111-8111-111111111111"));
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as any;
  const n = await syncPending(URL);
  expect(n).toBe(0);
  expect((await getPendingSessions()).length).toBe(1);
});
