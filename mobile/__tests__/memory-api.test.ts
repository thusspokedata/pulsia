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

test("refreshMemory aborta a los 60s (no a los 15s por defecto)", async () => {
  jest.useFakeTimers();
  const abortSpy = jest.spyOn(AbortController.prototype, "abort");
  // fetch que nunca resuelve, salvo que se aborte la señal.
  global.fetch = jest.fn((_u: any, init: any) => new Promise((_res, rej) => {
    // `fetch` real rechaza de inmediato si la señal ya viene abortada (apiFetch lee el
    // token —async— antes de llamar a fetch, así que el abort puede preceder a este listener).
    if (init.signal.aborted) return rej(new DOMException("Aborted", "AbortError"));
    init.signal.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError")));
  })) as any;
  const p = refreshMemory(URL).catch(() => "aborted");
  // A los 15s (el default de apiFetch) todavía NO debe haber abortado.
  jest.advanceTimersByTime(15000);
  expect(abortSpy).not.toHaveBeenCalled();
  // A los 60s SÍ (el timeout que pasa refreshMemory).
  jest.advanceTimersByTime(45000);
  expect(abortSpy).toHaveBeenCalled();
  await p;
  abortSpy.mockRestore();
  jest.useRealTimers();
});

test("refreshMemory lanza si el backend responde no-ok", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as any;
  await expect(refreshMemory(URL)).rejects.toThrow("No se pudo actualizar la memoria");
});
