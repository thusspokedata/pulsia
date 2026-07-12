import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { uploadEcg, listEcg, getEcg } from "../src/api/ecg";
import type { EcgRecording } from "@pulsia/shared";
import EcgScreen from "../app/ecg";

// Mock de los pickers/FS nativos y del cliente de ECG: el test verifica el flujo
// (upload → poll → refresh) sobre los mocks, sin tocar el backend real.
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: jest.fn(),
  downloadAsync: jest.fn(),
  cacheDirectory: "file:///cache/",
}));
jest.mock("../src/api/ecg", () => ({
  uploadEcg: jest.fn(),
  listEcg: jest.fn(),
  getEcg: jest.fn(),
  deleteEcg: jest.fn(),
  ecgPdfUrl: (base: string, id: string) => `${base}/ecg/${id}/pdf`,
}));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://backend.test") }));
jest.mock("../src/storage/authToken", () => ({ getToken: jest.fn(async () => "tok") }));

const REC_ID = "11111111-1111-4111-8111-111111111111";
const doneRec: EcgRecording = {
  id: REC_ID,
  status: "done",
  createdAt: 1782900000000,
  analysis: {
    kardiaVerdict: "Normal",
    avgHeartRate: 72,
    recordedAt: "2026-07-12T10:00:00.000Z",
    interpretation: "Ritmo sinusal normal, sin hallazgos relevantes en esta lectura.",
  },
  error: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  (listEcg as jest.Mock).mockResolvedValue([doneRec]);
});
afterEach(() => {
  jest.useRealTimers();
});

test("en el mount lista los registros con fecha, veredicto de Kardia e interpretación", async () => {
  render(<EcgScreen />);
  await waitFor(() => expect(screen.getByTestId(`ecg-item-${REC_ID}`)).toBeTruthy());
  expect(screen.getByText("Normal")).toBeTruthy();
  expect(screen.getByText(doneRec.analysis!.interpretation)).toBeTruthy();
});

test("el disclaimer médico está visible", async () => {
  render(<EcgScreen />);
  await waitFor(() => expect(screen.getByTestId(`ecg-item-${REC_ID}`)).toBeTruthy());
  expect(screen.getByText(/no reemplaza la evaluación de un médico/i)).toBeTruthy();
});

test("Subir ECG: si uploadEcg falla, muestra el motivo real del backend (no un texto genérico)", async () => {
  (listEcg as jest.Mock).mockResolvedValue([]);
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///picked.pdf", name: "ecg.pdf", lastModified: 0 }],
  });
  (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue("base64data");
  (uploadEcg as jest.Mock).mockRejectedValue(new Error("PDF demasiado grande (máx 10 MB)"));

  render(<EcgScreen />);
  await waitFor(() => expect(listEcg).toHaveBeenCalled());

  await act(async () => {
    fireEvent.press(screen.getByTestId("upload-ecg"));
  });

  await waitFor(() => expect(screen.getByText("PDF demasiado grande (máx 10 MB)")).toBeTruthy());
});

test("Subir ECG: si la subida excede el timeout (AbortError), muestra el aviso de timeout", async () => {
  (listEcg as jest.Mock).mockResolvedValue([]);
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///picked.pdf", name: "ecg.pdf", lastModified: 0 }],
  });
  (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue("base64data");
  // apiFetch aborta el request al vencer el timeout → un Error con name "AbortError".
  const abort = new Error("Aborted");
  abort.name = "AbortError";
  (uploadEcg as jest.Mock).mockRejectedValue(abort);

  render(<EcgScreen />);
  await waitFor(() => expect(listEcg).toHaveBeenCalled());

  await act(async () => {
    fireEvent.press(screen.getByTestId("upload-ecg"));
  });

  await waitFor(() => expect(screen.getByText(/La subida tardó demasiado/)).toBeTruthy());
});

test("Subir ECG: si falla la lectura del archivo, avisa y no llama a uploadEcg", async () => {
  (listEcg as jest.Mock).mockResolvedValue([]);
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///picked.pdf", name: "ecg.pdf", lastModified: 0 }],
  });
  (FileSystem.readAsStringAsync as jest.Mock).mockRejectedValue(new Error("read fail"));

  render(<EcgScreen />);
  await waitFor(() => expect(listEcg).toHaveBeenCalled());

  await act(async () => {
    fireEvent.press(screen.getByTestId("upload-ecg"));
  });

  await waitFor(() => expect(screen.getByText("No se pudo leer el archivo seleccionado.")).toBeTruthy());
  // La lectura falló antes de la red: no se intenta subir.
  expect(uploadEcg).not.toHaveBeenCalled();
});

test("Subir ECG: elige archivo → lee base64 → uploadEcg → pollea getEcg hasta done (muestra Analizando…)", async () => {
  (listEcg as jest.Mock)
    .mockResolvedValueOnce([]) // lista inicial vacía
    .mockResolvedValue([doneRec]); // refresh tras el análisis
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///picked.pdf", name: "ecg.pdf", lastModified: 0 }],
  });
  (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue("base64data");
  (uploadEcg as jest.Mock).mockResolvedValue({ id: REC_ID, status: "pending" });
  (getEcg as jest.Mock)
    .mockResolvedValueOnce({ ...doneRec, status: "pending", analysis: null })
    .mockResolvedValue(doneRec);

  render(<EcgScreen />);
  await waitFor(() => expect(listEcg).toHaveBeenCalled());

  // Timers falsos recién ahora: el poll (setInterval) se crea al presionar y así lo
  // podemos avanzar de forma determinista. El mount ya corrió con timers reales.
  jest.useFakeTimers();

  await act(async () => {
    fireEvent.press(screen.getByTestId("upload-ecg"));
  });

  // Se leyó el base64 y se subió al backend.
  expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith("file:///picked.pdf", { encoding: "base64" });
  await waitFor(() => expect(uploadEcg).toHaveBeenCalledWith("http://backend.test", "base64data"));

  // Mientras está pendiente muestra "Analizando…".
  expect(screen.getByText("Analizando…")).toBeTruthy();

  // Primer poll → sigue pending.
  await act(async () => {
    await jest.advanceTimersByTimeAsync(3000);
  });
  expect(getEcg).toHaveBeenCalledWith("http://backend.test", REC_ID);
  expect(screen.getByText("Analizando…")).toBeTruthy();

  // Segundo poll → done: refresca la lista y el registro aparece.
  await act(async () => {
    await jest.advanceTimersByTimeAsync(3000);
  });
  await waitFor(() => expect(screen.getByTestId(`ecg-item-${REC_ID}`)).toBeTruthy());
  expect(screen.queryByText("Analizando…")).toBeNull();
});
