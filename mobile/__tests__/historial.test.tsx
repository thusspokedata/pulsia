import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import { Alert } from "react-native";
import HistorialScreen from "../app/(tabs)/historial";
import { getSessions, getSessionById, deleteSessionById, putSession } from "../src/api/sessions";
import type { WorkoutSession } from "@pulsia/shared";

// Mock del componente nativo (SVG) para no cargar react-native-svg en jest.
jest.mock("react-native-body-highlighter", () => ({
  __esModule: true,
  default: () => null,
}));

const mockSessionA: WorkoutSession = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  programId: "22222222-2222-4222-8222-222222222222",
  weekNumber: 1,
  dayLabel: "Día 1: Pecho",
  location: "gym",
  startedAt: 1782900000000,
  endedAt: 1782903600000,
  totalDurationMs: 3600000,
  notes: "",
  exercises: [
    {
      catalogId: "barbell_bench_press",
      garminName: "Barbell Bench Press",
      order: 0,
      planned: { sets: 2, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90 },
      skipped: false,
      sets: [
        { setNumber: 1, startedAt: 2000, endedAt: 5000, durationMs: 3000, reps: 10, weightKg: 40, rpe: 8, repTimestamps: [], hrAvg: null, hrMax: null, skipped: false },
        { setNumber: 2, startedAt: 6000, endedAt: 10000, durationMs: 4000, reps: 8, weightKg: 42, rpe: 9, repTimestamps: [], hrAvg: null, hrMax: null, skipped: false },
      ],
    },
  ],
} as WorkoutSession;

const mockSessionB: WorkoutSession = {
  ...mockSessionA,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  dayLabel: "Día 2: Espalda",
  startedAt: 1783000000000,
  endedAt: 1783003600000,
} as WorkoutSession;

// getSessions devuelve la lista liviana (el backend NO manda los ejercicios); getSessionById
// trae la sesión completa al tocar. Los mockSession* tienen los campos livianos, así sirven para la lista.
jest.mock("../src/api/sessions", () => ({
  getSessions: jest.fn(async () => [
    { id: mockSessionA.id, programId: mockSessionA.programId, dayLabel: mockSessionA.dayLabel, location: "gym", startedAt: mockSessionA.startedAt, totalDurationMs: mockSessionA.totalDurationMs },
    { id: mockSessionB.id, programId: mockSessionB.programId, dayLabel: mockSessionB.dayLabel, location: "gym", startedAt: mockSessionB.startedAt, totalDurationMs: mockSessionB.totalDurationMs },
  ]),
  getSessionById: jest.fn(async (_url: string, id: string) => (id === mockSessionA.id ? mockSessionA : mockSessionB)),
  deleteSessionById: jest.fn(async () => undefined),
  putSession: jest.fn(async () => undefined),
}));
jest.mock("../src/storage/config", () => ({
  getBackendUrl: jest.fn(async () => "http://backend.test"),
}));
jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => void | (() => void)) => cb(),
}));

test("lista ambas sesiones ordenadas por fecha desc", async () => {
  await render(<HistorialScreen />);
  await waitFor(() => {
    expect(screen.getByTestId(`hist-item-${mockSessionA.id}`)).toBeTruthy();
    expect(screen.getByTestId(`hist-item-${mockSessionB.id}`)).toBeTruthy();
  });
});

test("al tocar una sesión muestra su SessionSummary y hist-back vuelve a la lista", async () => {
  await render(<HistorialScreen />);
  await waitFor(() => expect(screen.getByTestId(`hist-item-${mockSessionA.id}`)).toBeTruthy());

  await fireEvent.press(screen.getByTestId(`hist-item-${mockSessionA.id}`));
  await waitFor(() => expect(screen.getByTestId("summary")).toBeTruthy());

  await fireEvent.press(screen.getByTestId("hist-back"));
  await waitFor(() => expect(screen.getByTestId(`hist-item-${mockSessionA.id}`)).toBeTruthy());
});

test("si falla abrir una sesión muestra un error de detalle SIN ocultar la lista", async () => {
  (getSessionById as jest.Mock).mockRejectedValueOnce(new Error("boom"));
  await render(<HistorialScreen />);
  await waitFor(() => expect(screen.getByTestId(`hist-item-${mockSessionA.id}`)).toBeTruthy());
  await fireEvent.press(screen.getByTestId(`hist-item-${mockSessionA.id}`));
  await waitFor(() => expect(screen.getByTestId("hist-detail-error")).toBeTruthy());
  // La lista sigue visible (no la reemplazó el error).
  expect(screen.getByTestId(`hist-item-${mockSessionA.id}`)).toBeTruthy();
});

test("tocar 🗑 pide confirmación, y al confirmar borra en el backend y quita la fila sin abrir el detalle", async () => {
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await render(<HistorialScreen />);
  await waitFor(() => expect(screen.getByTestId(`hist-item-${mockSessionA.id}`)).toBeTruthy());

  await fireEvent.press(screen.getByTestId(`hist-del-${mockSessionA.id}`));

  // Se pidió confirmación y NO se abrió el detalle.
  expect(alertSpy).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId("summary")).toBeNull();

  // Tras borrar, el backend ya no devuelve la sesión A (el focus-effect puede re-fetchar).
  (getSessions as jest.Mock).mockResolvedValue([
    { id: mockSessionB.id, programId: mockSessionB.programId, dayLabel: mockSessionB.dayLabel, location: "gym", startedAt: mockSessionB.startedAt, totalDurationMs: mockSessionB.totalDurationMs },
  ]);

  // Invocar el onPress del botón "Sí, eliminar".
  const buttons = alertSpy.mock.calls[0][2] as any[];
  const confirm = buttons.find((b) => b.style === "destructive");
  await act(async () => {
    await confirm.onPress();
  });

  await waitFor(() => expect(deleteSessionById).toHaveBeenCalledWith("http://backend.test", mockSessionA.id));
  await waitFor(() => expect(screen.queryByTestId(`hist-item-${mockSessionA.id}`)).toBeNull());
  // La otra sesión sigue en la lista.
  expect(screen.getByTestId(`hist-item-${mockSessionB.id}`)).toBeTruthy();

  alertSpy.mockRestore();
});

test("un borrado que falla muestra el error, y un borrado exitoso posterior lo limpia", async () => {
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  // Reset del mock (otro test lo deja devolviendo solo la sesión B) para tener ambas filas.
  (getSessions as jest.Mock).mockResolvedValue([
    { id: mockSessionA.id, programId: mockSessionA.programId, dayLabel: mockSessionA.dayLabel, location: "gym", startedAt: mockSessionA.startedAt, totalDurationMs: mockSessionA.totalDurationMs },
    { id: mockSessionB.id, programId: mockSessionB.programId, dayLabel: mockSessionB.dayLabel, location: "gym", startedAt: mockSessionB.startedAt, totalDurationMs: mockSessionB.totalDurationMs },
  ]);
  await render(<HistorialScreen />);
  await waitFor(() => expect(screen.getByTestId(`hist-item-${mockSessionA.id}`)).toBeTruthy());

  const confirmDelete = async (id: string) => {
    alertSpy.mockClear();
    await fireEvent.press(screen.getByTestId(`hist-del-${id}`));
    const buttons = alertSpy.mock.calls[0][2] as any[];
    const confirm = buttons.find((b) => b.style === "destructive");
    await act(async () => {
      await confirm.onPress();
    });
  };

  // 1) Primer borrado falla → aparece el cartel "No se pudo eliminar".
  (deleteSessionById as jest.Mock).mockRejectedValueOnce(new Error("boom"));
  await confirmDelete(mockSessionA.id);
  await waitFor(() => expect(screen.getByTestId("hist-detail-error")).toBeTruthy());
  expect(screen.getByTestId("hist-detail-error").props.children).toBe("No se pudo eliminar");

  // 2) Segundo borrado (otra fila) tiene éxito → el cartel se limpia.
  await confirmDelete(mockSessionB.id);
  await waitFor(() => expect(screen.queryByTestId("hist-detail-error")).toBeNull());

  alertSpy.mockRestore();
});

test("editar la nota en el detalle del historial la guarda con putSession", async () => {
  await render(<HistorialScreen />);
  await waitFor(() => expect(screen.getByTestId(`hist-item-${mockSessionA.id}`)).toBeTruthy());
  await fireEvent.press(screen.getByTestId(`hist-item-${mockSessionA.id}`));
  const input = await screen.findByTestId("notes-input");
  await fireEvent.changeText(input, "revisar técnica de press");
  await fireEvent(input, "blur");
  await waitFor(() =>
    expect(putSession).toHaveBeenCalledWith("http://backend.test",
      expect.objectContaining({ id: mockSessionA.id, notes: "revisar técnica de press" })),
  );
});
