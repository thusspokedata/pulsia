import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import ProgresoScreen from "../app/(tabs)/progreso";
import { postReading, getLatestMetrics } from "../src/api/metrics";
import { getSessions, type SessionListItem } from "../src/api/sessions";
import { listCardio } from "../src/api/cardio";
import { getProfile } from "../src/storage/profile";
import { getNutritionGoal } from "../src/api/nutrition";
import { dayAtNoon } from "../src/session/metricDate";
import { colors } from "../src/theme/tokens";
import type { CardioActivity } from "@pulsia/shared";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://b.test" }));
jest.mock("../src/api/metrics", () => ({
  postReading: jest.fn(async () => []),
  getMetricSeries: jest.fn(async () => []),
  getLatestMetrics: jest.fn(async () => ({})),
}));
jest.mock("../src/api/progress", () => ({ getPerformance: jest.fn(async () => ({ perExercise: [], volumeSeries: [] })) }));
jest.mock("../src/api/sessions", () => ({ getSessions: jest.fn(async () => []) }));
jest.mock("../src/api/cardio", () => ({ listCardio: jest.fn(async () => []) }));
jest.mock("../src/storage/profile", () => ({ getProfile: jest.fn(async () => null) }));
jest.mock("../src/api/nutrition", () => ({ getNutritionGoal: jest.fn(async () => null) }));

const mockGetLatestMetrics = getLatestMetrics as jest.Mock;
const mockGetSessions = getSessions as jest.Mock;
const mockListCardio = listCardio as jest.Mock;
const mockGetProfile = getProfile as jest.Mock;
const mockGetNutritionGoal = getNutritionGoal as jest.Mock;

const NOW = new Date(2026, 6, 11, 9, 30).getTime();
const DAY = new Date(2026, 2, 15, 10, 0).getTime(); // 2026-03-15, local
const DAY_KEY = "2026-03-15";

function makeSession(startedAt: number, totalDurationMs = 60 * 60_000): SessionListItem {
  return {
    id: "s1", programId: "p1", dayLabel: "Día A", location: "gym",
    startedAt, totalDurationMs, completionPct: 100, avgHr: null,
  };
}

function makeCardio(startedAt: number, durationMs = 60 * 60_000): CardioActivity {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    type: "walk", startedAt, durationMs,
    distanceM: null, avgHr: null, maxHr: null, elevationGainM: null,
    kcal: null, kcalSource: "estimate", source: "manual", notes: "",
  };
}

beforeEach(() => {
  (postReading as jest.Mock).mockClear();
  mockGetLatestMetrics.mockResolvedValue({});
  mockGetSessions.mockResolvedValue([]);
  mockListCardio.mockResolvedValue([]);
  mockGetProfile.mockResolvedValue(null);
  mockGetNutritionGoal.mockResolvedValue(null);
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

test("sin peso en el perfil, las secciones de gasto explican qué falta en vez de mostrar la grilla", async () => {
  // Regresión: antes el heatmap funcionaba solo con duración. Al pasar a kcal, un usuario sin
  // perfil completo vería la grilla ENTERA vacía, que se lee como un bug de la app.
  mockGetProfile.mockResolvedValue({ age: 40, sex: "male" }); // sin weightKg
  mockGetLatestMetrics.mockResolvedValue({}); // sin peso medido
  mockGetSessions.mockResolvedValue([makeSession(DAY)]);

  const r = await render(<ProgresoScreen />);

  // Dos secciones (heatmap + barras) muestran el mismo mensaje.
  await waitFor(() => expect(r.queryAllByText(/Completá tu peso y edad en el perfil/).length).toBe(2));
  // Y la grilla NO se dibuja: había una sesión ese día, así que la celda existiría si se dibujara.
  expect(r.queryByTestId(`heatmap-cell-${DAY_KEY}`)).toBeNull();
});

test("con perfil completo se dibuja la grilla de gasto y desaparece el aviso de perfil", async () => {
  mockGetProfile.mockResolvedValue({ age: 40, sex: "male", weightKg: 80 });
  mockGetSessions.mockResolvedValue([makeSession(DAY)]);

  const r = await render(<ProgresoScreen />);

  expect(await r.findByText("Días entrenados y gasto")).toBeTruthy();
  expect(r.getByText("Gasto por día (4 sem)")).toBeTruthy();
  // La aserción que muerde: con peso, la grilla se dibuja y el aviso no está.
  await waitFor(() => expect(r.getByTestId(`heatmap-cell-${DAY_KEY}`)).toBeTruthy());
  expect(r.queryByText(/Completá tu peso y edad en el perfil/)).toBeNull();
});

test("un día con SOLO cardio pinta la celda del heatmap y su gasto sale del desglose", async () => {
  // Costura: `listCardio` tiene que estar realmente cableado a la pantalla. Que `buildDailyBurn`
  // sepa sumar cardio no prueba que Progreso le pase las actividades.
  mockGetProfile.mockResolvedValue({ age: 40, sex: "male", weightKg: 80 });
  mockGetSessions.mockResolvedValue([]); // sin fuerza: todo el gasto viene del cardio
  mockListCardio.mockResolvedValue([makeCardio(DAY)]);

  const r = await render(<ProgresoScreen />);

  const cell = await r.findByTestId(`heatmap-cell-${DAY_KEY}`);
  // Pintada = no es el gris de "sin actividad" ni una celda fuera del año.
  expect(cell.props.fill).not.toBe(colors.border);
  expect(cell.props.fill).not.toBe("transparent");

  // 1 h de caminata (MET 3.5) a 80 kg = 280 kcal, y tienen que aparecer como CARDIO, no fuerza.
  await fireEvent.press(cell);
  expect(r.getByTestId("heatmap-detail-cardio")).toHaveTextContent(/280/);
  expect(r.getByTestId("heatmap-detail-strength")).toHaveTextContent(/0 kcal/);
});

test("sin fuerza pero con cardio, el año del cardio aparece en el selector del heatmap", async () => {
  // `availableYears` tiene que recibir las actividades: si no, un usuario que solo hace cardio
  // no puede elegir el año y la grilla cae al año actual.
  mockGetProfile.mockResolvedValue({ age: 40, sex: "male", weightKg: 80 });
  mockGetSessions.mockResolvedValue([]);
  mockListCardio.mockResolvedValue([makeCardio(new Date(2025, 4, 20, 10, 0).getTime())]);

  const r = await render(<ProgresoScreen />);

  expect(await r.findByTestId("heatmap-year-2025")).toBeTruthy();
  // Y ese año quedó seleccionado, así que la celda del cardio de 2025 se dibuja.
  await waitFor(() => expect(r.getByTestId("heatmap-cell-2025-05-20")).toBeTruthy());
});
