import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import ProgresoScreen from "../app/(tabs)/progreso";
import { postReading } from "../src/api/metrics";
import { dayAtNoon } from "../src/session/metricDate";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://b.test" }));
jest.mock("../src/api/metrics", () => ({
  postReading: jest.fn(async () => []),
  getMetricSeries: jest.fn(async () => []),
  getLatestMetrics: jest.fn(async () => ({})),
}));
jest.mock("../src/api/progress", () => ({ getPerformance: jest.fn(async () => ({ perExercise: [], volumeSeries: [] })) }));
jest.mock("../src/api/sessions", () => ({ getSessions: jest.fn(async () => []) }));

const NOW = new Date(2026, 6, 11, 9, 30).getTime();

beforeEach(() => {
  (postReading as jest.Mock).mockClear();
  jest.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  (Date.now as jest.Mock).mockRestore?.();
});

test("elegir un día pasado + guardar actividad persiste la lectura con measuredAt del día elegido", async () => {
  await render(<ProgresoScreen />);
  // Esperar a que cargue (el selector de fecha ya está montado).
  await waitFor(() => expect(screen.getByTestId("date-prev")).toBeTruthy());

  // Ir a "ayer" (offset 1).
  await fireEvent.press(screen.getByTestId("date-prev"));
  // Cargar pasos.
  await fireEvent.changeText(screen.getByTestId("act-input-steps"), "8000");
  // Guardar la sección de actividad.
  await fireEvent.press(screen.getByTestId("act-save"));

  await waitFor(() =>
    expect(postReading).toHaveBeenCalledWith(
      "http://b.test",
      expect.objectContaining({
        measuredAt: dayAtNoon(1, NOW),
        entries: expect.arrayContaining([{ metricType: "steps", value: 8000 }]),
      }),
    ),
  );
});
