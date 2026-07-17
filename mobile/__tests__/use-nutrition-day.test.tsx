// mobile/__tests__/use-nutrition-day.test.tsx
// Cubre el wiring de cardio dentro de useNutritionDay que detalle.test.tsx no toca (mockea el hook
// entero): la llamada listCardio(url, from, to) y el mapeo de CardioActivity → CardioBurnInput
// ({ type, durationMs, avgHr, kcal }). Un typo en ese mapeo (p.ej. avgHr↔kcal invertidos) no lo
// cataría el CI sin este test.
import { renderHook, act, waitFor } from "@testing-library/react-native";
import type { CardioActivity, NutritionGoalInput, TrainingProfile } from "@pulsia/shared";

// useFocusEffect: dispara el callback una vez vía React.useEffect (el reload del hook).
jest.mock("expo-router", () => {
  const React = require("react");
  return { useFocusEffect: (cb: React.EffectCallback) => React.useEffect(cb, [cb]) };
});

jest.mock("../src/storage/config", () => ({
  getBackendUrl: jest.fn(async () => "http://x"),
}));

const mockGoalInput: NutritionGoalInput = { objective: "maintain", rateKgPerWeek: 0, manualKcal: null };
jest.mock("../src/api/nutrition", () => ({
  listMeals: jest.fn(async () => []),
  listWater: jest.fn(async () => []),
  getNutritionGoal: jest.fn(async () => mockGoalInput),
}));

// Perfil completo con antropometría → computeNutritionGoal da status "ok" (bmr no-null).
const mockProfile: TrainingProfile = {
  experience: "intermediate",
  goal: "hypertrophy",
  sex: "male",
  age: 30,
  weightKg: 80,
  heightCm: 180,
  activityLevel: "moderate",
  daysPerWeek: 4,
  sessionMinutes: 60,
  gymEquipment: [],
  homeEquipment: [],
  limitations: [],
};
jest.mock("../src/storage/profile", () => ({
  getProfile: jest.fn(async () => mockProfile),
}));

// Camino offline: sin métricas recientes, cae al peso del perfil.
jest.mock("../src/api/metrics", () => ({
  getLatestMetrics: jest.fn(async () => ({})),
}));

jest.mock("../src/api/sessions", () => ({
  getSessions: jest.fn(async () => []),
}));

// Actividad con kcal del reloj (device): dayExerciseBurn debe usarla tal cual (150), sin estimar.
const mockCardioActivity: CardioActivity = {
  id: "11111111-1111-1111-1111-111111111111",
  type: "walk",
  startedAt: Date.now(),
  durationMs: 1_800_000,
  distanceM: 2000,
  avgHr: null,
  maxHr: null,
  elevationGainM: null,
  kcal: 150,
  kcalSource: "device",
  source: "fit",
  notes: "",
};
const mockListCardio = jest.fn(async (_url: string, _from?: number, _to?: number) => [mockCardioActivity]);
jest.mock("../src/api/cardio", () => ({
  listCardio: (...args: [string, number?, number?]) => mockListCardio(...args),
}));

import { useNutritionDay } from "../src/nutrition/useNutritionDay";

beforeEach(() => {
  jest.clearAllMocks();
});

test("mapea el cardio del reloj al gasto del día y llama listCardio con (url, from, to)", async () => {
  const { result } = await renderHook(() => useNutritionDay(0));

  // El reload lo dispara useFocusEffect (efecto): dejamos que las promesas del hook (getBackendUrl
  // → Promise.all → setState) drenen dentro de act antes de leer el resultado.
  await act(async () => { await Promise.resolve(); });

  // kcal del reloj (device): pasa tal cual, sin estimarse por Keytel/MET. Si el mapeo avgHr↔kcal
  // estuviera invertido, kcal caería a null → se estimaría y NO daría 150.
  await waitFor(() => expect(result.current.exercise).toBe(150));

  // Orden correcto de argumentos del rango: (baseUrl, from, to) con from <= to.
  expect(mockListCardio).toHaveBeenCalledTimes(1);
  const [url, from, to] = mockListCardio.mock.calls[0];
  expect(url).toBe("http://x");
  expect(typeof from).toBe("number");
  expect(typeof to).toBe("number");
  expect(from as number).toBeLessThanOrEqual(to as number);
});
