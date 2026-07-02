import { putSession } from "../src/api/sessions";
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
