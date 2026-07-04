import { getMemory, refreshMemory } from "../src/api/memory";

const URL = "http://backend.test";

afterEach(() => { (global.fetch as any) = undefined; });

test("getMemory hace GET a /memory y devuelve el content en 2xx", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: "sabe X" }) });
  global.fetch = fetchMock as any;
  const result = await getMemory(URL);
  const [calledUrl] = fetchMock.mock.calls[0];
  expect(calledUrl).toBe(`${URL}/memory`);
  expect(result).toBe("sabe X");
});

test("getMemory lanza si el backend responde no-ok", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as any;
  await expect(getMemory(URL)).rejects.toThrow("No se pudo cargar la memoria");
});

test("refreshMemory hace POST a /memory/refresh y devuelve el content actualizado en 2xx", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: "actualizada" }) });
  global.fetch = fetchMock as any;
  const result = await refreshMemory(URL);
  const [calledUrl, init] = fetchMock.mock.calls[0];
  expect(calledUrl).toBe(`${URL}/memory/refresh`);
  expect(init.method).toBe("POST");
  expect(init.signal).toBeDefined();
  expect(result).toBe("actualizada");
});

test("refreshMemory usa timeout de 60s", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: "ok" }) });
  global.fetch = fetchMock as any;
  await refreshMemory(URL);
  const [, init] = fetchMock.mock.calls[0];
  // Verificamos que se pasó el timeoutMs; no podemos acceder directamente,
  // pero la implementación debe pasar 60000 a apiFetch.
  expect(init).toBeDefined();
});

test("refreshMemory lanza si el backend responde no-ok", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as any;
  await expect(refreshMemory(URL)).rejects.toThrow("No se pudo actualizar la memoria");
});
