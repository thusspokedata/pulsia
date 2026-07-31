import { apiFetch, ApiError } from "./client";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

test("GET no manda X-Requested-With ni body", async () => {
  const f = mockFetch(200, { hola: 1 });
  vi.stubGlobal("fetch", f);
  const data = await apiFetch("/metrics");
  expect(data).toEqual({ hola: 1 });
  const [, init] = f.mock.calls[0];
  expect(init.credentials).toBe("same-origin");
  expect(init.headers["X-Requested-With"]).toBeUndefined();
});

test("POST agrega X-Requested-With y serializa el body", async () => {
  const f = mockFetch(200, { id: "x" });
  vi.stubGlobal("fetch", f);
  await apiFetch("/cardio", { method: "POST", body: { a: 1 } });
  const [, init] = f.mock.calls[0];
  expect(init.headers["X-Requested-With"]).toBe("fetch");
  expect(init.headers["content-type"]).toBe("application/json");
  expect(init.body).toBe(JSON.stringify({ a: 1 }));
});

test("un 401 dispara el handler de no-autorizado y lanza ApiError", async () => {
  vi.stubGlobal("fetch", mockFetch(401, { error: "no" }));
  const onUnauthorized = vi.fn();
  await expect(apiFetch("/metrics", { onUnauthorized })).rejects.toBeInstanceOf(ApiError);
  expect(onUnauthorized).toHaveBeenCalled();
});

test("un 4xx no-401 lanza ApiError con el mensaje del server", async () => {
  vi.stubGlobal("fetch", mockFetch(409, { error: "Ya importaste esta actividad" }));
  await expect(apiFetch("/cardio", { method: "POST", body: {} }))
    .rejects.toMatchObject({ status: 409, message: "Ya importaste esta actividad" });
});
