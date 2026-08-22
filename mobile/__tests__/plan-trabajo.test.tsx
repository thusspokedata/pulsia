// mobile/__tests__/plan-trabajo.test.tsx
// Cubre COACH-1 Fase 3 / Task 3.1: la pantalla global "Plan de trabajo" que junta objetivo, meta
// nutricional (con su porqué) y programa actual (con su porqué global + por día).
import { render, waitFor } from "@testing-library/react-native";
import type { NutritionGoalResult, Program, TrainingProfile } from "@pulsia/shared";
import PlanTrabajoScreen from "../app/plan-trabajo";
import { getStoredProgram } from "../src/storage/program";
import { loadDailyGoalContext } from "../src/nutrition/dailyGoal";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));

jest.mock("../src/storage/config", () => ({
  getBackendUrl: jest.fn(async () => "http://x"),
}));

const mockGetObjective = jest.fn((..._a: any[]): Promise<string> => Promise.resolve("mi norte"));
const mockPutObjective = jest.fn((...a: any[]): Promise<string> => Promise.resolve(a[1]));
const mockDraftObjective = jest.fn((..._a: any[]): Promise<string> => Promise.resolve("borrador IA"));
jest.mock("../src/api/objective", () => ({
  getObjective: (...a: any[]) => mockGetObjective(...a),
  putObjective: (...a: any[]) => mockPutObjective(...a),
  draftObjective: (...a: any[]) => mockDraftObjective(...a),
}));

jest.mock("../src/storage/program", () => ({
  getStoredProgram: jest.fn(),
}));

jest.mock("../src/nutrition/dailyGoal", () => ({
  loadDailyGoalContext: jest.fn(),
}));

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

const mockGoalResult: NutritionGoalResult = {
  status: "ok", source: "auto", kcal: 2200, protein_g: 160, carbs_g: 220, fat_g: 66, bmr: 1780, tdee: 2200,
};

function mockDailyGoal() {
  (loadDailyGoalContext as jest.Mock).mockResolvedValue({
    profile: mockProfile,
    weightKg: 80,
    goalResult: mockGoalResult,
    goalInput: { objective: "lose", rateKgPerWeek: 0.5, manualKcal: null },
  });
}

const programWithRationale: Program = {
  name: "Programa A",
  rationale: "Priorizamos tren superior porque el objetivo pide fuerza en press.",
  weeks: [
    {
      weekNumber: 1,
      workouts: [
        {
          dayLabel: "Día 1 - Empuje",
          location: "gym",
          targetMuscles: ["chest"],
          exercises: [],
          rationale: "Empuje porque el objetivo prioriza press de banca.",
        },
      ],
    },
  ],
};

const programWithoutRationale: Program = {
  name: "Programa Viejo",
  weeks: [
    {
      weekNumber: 1,
      workouts: [
        { dayLabel: "Día 1 - Empuje", location: "gym", targetMuscles: ["chest"], exercises: [] },
      ],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetObjective.mockResolvedValue("mi norte");
  mockDailyGoal();
});

test("programa CON rationale: muestra el porqué global y el porqué del día", async () => {
  (getStoredProgram as jest.Mock).mockResolvedValue(programWithRationale);

  const { getByText } = await render(<PlanTrabajoScreen />);

  await waitFor(() => expect(getByText(/Priorizamos tren superior/i)).toBeTruthy());
  expect(getByText(/Empuje porque el objetivo prioriza press de banca/i)).toBeTruthy();
});

test("programa SIN rationale (plan viejo): muestra la nota de regenerar", async () => {
  (getStoredProgram as jest.Mock).mockResolvedValue(programWithoutRationale);

  const { getByText } = await render(<PlanTrabajoScreen />);

  await waitFor(() => expect(getByText(/Regenerá el plan/i)).toBeTruthy());
});

test("sin programa: muestra que todavía no hay plan generado", async () => {
  (getStoredProgram as jest.Mock).mockResolvedValue(null);

  const { getByText } = await render(<PlanTrabajoScreen />);

  await waitFor(() => expect(getByText(/Todavía no hay un plan generado/i)).toBeTruthy());
});
