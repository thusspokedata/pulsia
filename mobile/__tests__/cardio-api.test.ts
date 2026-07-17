import { listCardio, createCardio, getCardioById, updateCardio, deleteCardio } from "../src/api/cardio";

const AID = "11111111-1111-4111-8111-111111111111";
const activity = {
  id: AID, type: "walk" as const, startedAt: 1784000000000, durationMs: 1800000,
  distanceM: 2500, avgHr: null, maxHr: null, elevationGainM: null,
  kcal: null, kcalSource: "estimate" as const, source: "manual" as const, notes: "",
};

afterEach(() => { (global.fetch as any) = undefined; });

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = jest.fn().mockResolvedValue({ ok, status, json: async () => body });
  (global.fetch as any) = fn;
  return fn;
}

test("listCardio hace GET /cardio y devuelve el array", async () => {
  const fn = mockFetch([activity]);
  const res = await listCardio("http://x");
  expect(res).toEqual([activity]);
  expect(fn.mock.calls[0][0]).toBe("http://x/cardio");
});

test("createCardio hace POST /cardio con el body", async () => {
  const fn = mockFetch({ id: AID });
  await createCardio("http://x", activity);
  const [url, init] = fn.mock.calls[0];
  expect(url).toBe("http://x/cardio");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual(activity);
});

test("createCardio lanza en 409 (duplicado)", async () => {
  mockFetch({ error: "Ya importaste esta actividad" }, false, 409);
  await expect(createCardio("http://x", activity)).rejects.toThrow();
});

test("getCardioById hace GET /cardio/:id y devuelve la actividad", async () => {
  const fn = mockFetch(activity);
  const res = await getCardioById("http://x", AID);
  expect(res).toEqual(activity);
  const [url, init] = fn.mock.calls[0];
  expect(url).toBe(`http://x/cardio/${AID}`);
  expect(init?.method ?? "GET").toBe("GET");
});

test("updateCardio hace PATCH /cardio/:id con el patch en el body", async () => {
  const fn = mockFetch({});
  const patch = { type: "run" as const, durationMs: 1200000, distanceM: 3000, notes: "más rápido" };
  await updateCardio("http://x", AID, patch);
  const [url, init] = fn.mock.calls[0];
  expect(url).toBe(`http://x/cardio/${AID}`);
  expect(init.method).toBe("PATCH");
  expect(JSON.parse(init.body)).toEqual(patch);
});

test("deleteCardio hace DELETE /cardio/:id", async () => {
  const fn = mockFetch({ id: AID });
  await deleteCardio("http://x", AID);
  const [url, init] = fn.mock.calls[0];
  expect(url).toBe(`http://x/cardio/${AID}`);
  expect(init.method).toBe("DELETE");
});
