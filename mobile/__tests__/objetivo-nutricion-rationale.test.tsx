// mobile/__tests__/objetivo-nutricion-rationale.test.tsx
// Cubre COACH-1 Fase 2 / Task 2.5: el bloque "¿Por qué esta meta?" (rationale determinista de
// buildGoalRationale) bajo la meta calculada, solo cuando el goal resuelve a status "ok".
import { render, waitFor } from "@testing-library/react-native";
import type { NutritionGoalInput, TrainingProfile } from "@pulsia/shared";
import ObjetivoScreen from "../app/nutricion/objetivo";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));

jest.mock("../src/storage/config", () => ({
  getBackendUrl: jest.fn(async () => "http://x"),
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

jest.mock("../src/api/metrics", () => ({
  getLatestMetrics: jest.fn(async () => ({})),
}));

const mockGoalInput: NutritionGoalInput = { objective: "lose", rateKgPerWeek: 0.5, manualKcal: null };
jest.mock("../src/api/nutrition", () => ({
  getNutritionGoal: jest.fn(async () => mockGoalInput),
  putNutritionGoal: jest.fn(async () => {}),
}));

test("muestra el bloque '¿Por qué esta meta?' con el porqué determinista", async () => {
  const { getByText } = await render(<ObjetivoScreen />);
  await waitFor(() => expect(getByText(/¿Por qué esta meta\?/i)).toBeTruthy());
  // El texto se deriva de buildGoalRationale y debe mencionar el objetivo (déficit) fijado por el mock.
  await waitFor(() => expect(getByText(/déficit/i)).toBeTruthy());
});
