import AsyncStorage from "@react-native-async-storage/async-storage";
import { getActiveSession, setActiveSession, clearActiveSession } from "../src/storage/activeSession";
import { enqueueSession, getPendingSessions, removePendingSession } from "../src/storage/pendingSessions";
import type { WorkoutSession } from "@pulsia/shared";

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  programId: "22222222-2222-4222-8222-222222222222",
  weekNumber: 1, dayLabel: "Día 1", location: "gym" as const,
  startedAt: 1782900000000, endedAt: null, totalDurationMs: null, notes: "",
  exercises: [],
};
const session = base as WorkoutSession;

beforeEach(async () => { await AsyncStorage.clear(); });

test("activeSession: set/get/clear", async () => {
  expect(await getActiveSession()).toBeNull();
  await setActiveSession(session);
  expect((await getActiveSession())?.id).toBe(session.id);
  await clearActiveSession();
  expect(await getActiveSession()).toBeNull();
});

test("getActiveSession devuelve null si el guardado es inválido", async () => {
  await AsyncStorage.setItem("pulsia.activeSession", "{ not json");
  expect(await getActiveSession()).toBeNull();
});

test("pendingSessions: enqueue hace upsert por id (no duplica)", async () => {
  await enqueueSession(session);
  await enqueueSession({ ...session, notes: "editada" });
  const pend = await getPendingSessions();
  expect(pend.length).toBe(1);
  expect(pend[0].notes).toBe("editada");
});

test("pendingSessions: enqueue de otro id agrega; remove saca por id", async () => {
  const other = { ...base, id: "33333333-3333-4333-8333-333333333333" } as WorkoutSession;
  await enqueueSession(session);
  await enqueueSession(other);
  expect((await getPendingSessions()).length).toBe(2);
  await removePendingSession(session.id);
  const pend = await getPendingSessions();
  expect(pend.length).toBe(1);
  expect(pend[0].id).toBe(other.id);
});
