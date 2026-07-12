import { uploadEcg, listEcg, getEcg, deleteEcg, ecgPdfUrl } from "../src/api/ecg";
import type { EcgRecording } from "@pulsia/shared";

const URL = "http://backend.test";
const recording: EcgRecording = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "done",
  createdAt: 1782900000000,
  analysis: {
    kardiaVerdict: "Normal",
    avgHeartRate: 72,
    recordedAt: "2026-07-12T10:00:00.000Z",
    interpretation: "Ritmo sinusal normal.",
  },
  error: null,
};

afterEach(() => { (global.fetch as any) = undefined; });

test("uploadEcg hace POST a /ecg con { pdfBase64 } y devuelve { id, status }", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: recording.id, status: "pending" }) });
  global.fetch = fetchMock as any;
  const result = await uploadEcg(URL, "base64data");
  const [calledUrl, init] = fetchMock.mock.calls[0];
  expect(calledUrl).toBe(`${URL}/ecg`);
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ pdfBase64: "base64data" });
  expect(result).toEqual({ id: recording.id, status: "pending" });
});

test("uploadEcg lanza si el backend responde no-ok", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }) as any;
  await expect(uploadEcg(URL, "base64data")).rejects.toThrow();
});

test("listEcg hace GET a /ecg y devuelve el array de recordings en 2xx", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ recordings: [recording] }) });
  global.fetch = fetchMock as any;
  const result = await listEcg(URL);
  const [calledUrl] = fetchMock.mock.calls[0];
  expect(calledUrl).toBe(`${URL}/ecg`);
  expect(result).toEqual([recording]);
});

test("listEcg lanza si el backend responde no-ok", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as any;
  await expect(listEcg(URL)).rejects.toThrow();
});

test("getEcg hace GET a /ecg/:id y devuelve el registro en 2xx", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => recording });
  global.fetch = fetchMock as any;
  const result = await getEcg(URL, recording.id);
  const [calledUrl] = fetchMock.mock.calls[0];
  expect(calledUrl).toBe(`${URL}/ecg/${recording.id}`);
  expect(result).toEqual(recording);
});

test("getEcg lanza si el backend responde no-ok", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }) as any;
  await expect(getEcg(URL, recording.id)).rejects.toThrow();
});

test("deleteEcg hace DELETE a /ecg/:id y resuelve en 2xx", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
  global.fetch = fetchMock as any;
  await deleteEcg(URL, recording.id);
  const [calledUrl, init] = fetchMock.mock.calls[0];
  expect(calledUrl).toBe(`${URL}/ecg/${recording.id}`);
  expect(init.method).toBe("DELETE");
});

test("deleteEcg lanza si el backend responde no-ok", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }) as any;
  await expect(deleteEcg(URL, recording.id)).rejects.toThrow();
});

test("ecgPdfUrl arma la URL del PDF", () => {
  expect(ecgPdfUrl(URL, recording.id)).toBe(`${URL}/ecg/${recording.id}/pdf`);
});
