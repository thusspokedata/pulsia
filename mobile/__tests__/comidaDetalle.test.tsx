import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import type { Meal, MealItem, NutritionGoalInput, TrainingProfile } from "@pulsia/shared";

const MEAL_ID = "aaaaaaaa-1111-4111-8111-111111111111";

// useFocusEffect: dispara el callback una vez vía React.useEffect (mismo criterio que
// use-nutrition-day.test.tsx). Con `(cb) => cb()` el reload se dispararía en CADA render.
jest.mock("expo-router", () => {
  const React = require("react");
  return {
    router: { push: jest.fn(), back: jest.fn() },
    useFocusEffect: (cb: React.EffectCallback) => React.useEffect(cb, [cb]),
    useLocalSearchParams: jest.fn(() => ({ id: MEAL_ID })),
  };
});

jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));

const mockGoalInput: NutritionGoalInput = { objective: "maintain", rateKgPerWeek: 0, manualKcal: 2200 };
jest.mock("../src/api/nutrition", () => ({
  getMeal: jest.fn(),
  getNutritionGoal: jest.fn(async () => mockGoalInput),
  // Los usa la pestaña de nutrición, que este archivo también renderiza para probar la navegación.
  deleteMeal: jest.fn(), logWater: jest.fn(), deleteWater: jest.fn(),
}));
jest.mock("../src/api/metrics", () => ({ getLatestMetrics: jest.fn(async () => ({})) }));
jest.mock("../src/api/supplements", () => ({
  getDayChecklist: jest.fn(async () => ({ hasPlan: false, entries: [] })),
  putTake: jest.fn(),
}));
jest.mock("../src/nutrition/useNutritionDay", () => ({ useNutritionDay: jest.fn() }));

// Perfil con sexo y edad: las referencias EFSA salen personalizadas (hierro varón = 11 mg).
const perfilCompleto: TrainingProfile = {
  experience: "intermediate", goal: "hypertrophy",
  sex: "male", age: 35, weightKg: 70, heightCm: 178, activityLevel: "moderate",
  daysPerWeek: 4, sessionMinutes: 60, gymEquipment: [], homeEquipment: [], limitations: [],
};
jest.mock("../src/storage/profile", () => ({ getProfile: jest.fn(async () => null) }));

import ComidaDetalleScreen from "../app/nutricion/comida";
import NutricionScreen from "../app/(tabs)/nutricion";
import { getMeal } from "../src/api/nutrition";
import { getProfile } from "../src/storage/profile";
import { useNutritionDay } from "../src/nutrition/useNutritionDay";

const item = (over: Partial<MealItem> & Pick<MealItem, "foodName">): MealItem => ({
  id: "11111111-1111-4111-8111-111111111111",
  foodId: "22222222-2222-4222-8222-222222222222",
  quantity: 100, quantityUnit: "g", grams: 100,
  kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 5,
  ...over,
});

const comida = (items: MealItem[]): Meal => ({
  id: MEAL_ID, eatenAt: new Date(2026, 6, 24, 13, 45).getTime(), mealType: "almuerzo", note: null, items,
});

function mockComida(m: Meal) {
  (getMeal as jest.Mock).mockResolvedValue(m);
}

beforeEach(() => {
  jest.clearAllMocks();
  (getProfile as jest.Mock).mockResolvedValue(perfilCompleto);
  mockComida(comida([item({ foodName: "Pechuga de pollo" })]));
});

test("muestra los ingredientes con su gramaje", async () => {
  mockComida(comida([
    item({ foodName: "Pechuga de pollo", quantity: 150, grams: 150, kcal: 248, protein_g: 46.5, carbs_g: 0, fat_g: 5.4 }),
    item({ id: "33333333-3333-4333-8333-333333333333", foodName: "Arroz integral", quantity: 80, grams: 80, kcal: 296, protein_g: 6, carbs_g: 62, fat_g: 2 }),
  ]));
  await render(<ComidaDetalleScreen />);

  await waitFor(() => expect(screen.getByText("Pechuga de pollo")).toBeTruthy());
  expect(screen.getByText("Arroz integral")).toBeTruthy();
  expect(screen.getByTestId("ingrediente-0-cantidad")).toHaveTextContent(/^150 g$/);
  expect(screen.getByTestId("ingrediente-1-cantidad")).toHaveTextContent(/^80 g$/);
  // Y sus macros, que es lo que distingue "lista de nombres" de "detalle del ingrediente".
  expect(screen.getByTestId("ingrediente-0-macros")).toHaveTextContent(/^248 kcal · P46\.5 C0 G5\.4$/);
});

test("los nutrientes de la comida se comparan contra la referencia diaria personal", async () => {
  // 2,5 + 3 = 5,5 mg de hierro. Referencia EFSA de un varón adulto: 11 mg → 50 %.
  mockComida(comida([
    item({ foodName: "Lentejas", iron_mg: 2.5 }),
    item({ id: "33333333-3333-4333-8333-333333333333", foodName: "Espinaca", iron_mg: 3 }),
  ]));
  await render(<ComidaDetalleScreen />);

  await waitFor(() => expect(screen.getByTestId("nutr-grupo-minerales")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales")); // los minerales arrancan colapsados
  expect(screen.getByTestId("nutr-iron_mg-amount")).toHaveTextContent(/^5\.5 \/ 11 mg$/);
  expect(screen.getByTestId("nutr-iron_mg-pct")).toHaveTextContent(/^50 %$/);
});

test("la referencia es la de ESE perfil: la misma comida da otro porcentaje para una mujer", async () => {
  // Sin este caso, una pantalla que ignore el perfil y use siempre la tabla masculina pasa verde.
  (getProfile as jest.Mock).mockResolvedValue({ ...perfilCompleto, sex: "female" });
  mockComida(comida([item({ foodName: "Lentejas", iron_mg: 5.5 })]));
  await render(<ComidaDetalleScreen />);

  await waitFor(() => expect(screen.getByTestId("nutr-grupo-minerales")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  expect(screen.getByTestId("nutr-iron_mg-amount")).toHaveTextContent(/^5\.5 \/ 16 mg$/);
});

test("una comida sin micros muestra 'sin dato', no ceros", async () => {
  mockComida(comida([item({ foodName: "Pechuga de pollo" })]));
  await render(<ComidaDetalleScreen />);

  await waitFor(() => expect(screen.getByTestId("nutr-grupo-minerales")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  expect(screen.getByTestId("nutr-zinc_mg-amount")).toHaveTextContent(/^sin dato$/);
  expect(screen.queryByTestId("nutr-zinc_mg-bar")).toBeNull();
});

test("el aporte de la comida se muestra contra la meta del día", async () => {
  mockComida(comida([
    item({ foodName: "Pechuga de pollo", kcal: 248, protein_g: 46.5, carbs_g: 0, fat_g: 5.4 }),
    item({ id: "33333333-3333-4333-8333-333333333333", foodName: "Arroz integral", kcal: 296, protein_g: 6, carbs_g: 62, fat_g: 2 }),
  ]));
  await render(<ComidaDetalleScreen />);

  // 248 + 296 = 544 kcal de una meta de 2200 (manualKcal del objetivo mockeado).
  await waitFor(() => expect(screen.getByTestId("comida-goal-kcal")).toHaveTextContent(/^544 \/ 2200 kcal$/));
  // Proteína: 46,5 + 6 = 52,5 → 53. Meta = 70 kg × 1.8 (maintain) = 126 g.
  expect(screen.getByTestId("comida-goal-protein")).toHaveTextContent(/^53 \/ 126 g$/);
});

test("el título dice qué comida es y a qué hora", async () => {
  await render(<ComidaDetalleScreen />);
  await waitFor(() => expect(screen.getByTestId("comida-titulo")).toHaveTextContent(/^Almuerzo · 13:45$/));
});

test("sin sexo ni edad en el perfil avisa que las referencias son conservadoras", async () => {
  (getProfile as jest.Mock).mockResolvedValue({ ...perfilCompleto, sex: undefined, age: undefined });
  await render(<ComidaDetalleScreen />);
  await waitFor(() => expect(screen.getByTestId("comida-aviso-perfil")).toBeTruthy());
});

test("con el perfil completo no aparece el aviso", async () => {
  await render(<ComidaDetalleScreen />);
  await waitFor(() => expect(screen.getByTestId("comida-titulo")).toBeTruthy());
  expect(screen.queryByTestId("comida-aviso-perfil")).toBeNull();
});

test("tocar una comida del día abre SU detalle, no el formulario de edición", async () => {
  // La costura: sin esto la pantalla nueva existe y nadie puede llegar a ella.
  (useNutritionDay as jest.Mock).mockReturnValue({
    error: null, setError: jest.fn(), water: [], goalView: null, baseUrl: "http://x", reload: jest.fn(),
    meals: [comida([item({ foodName: "Pechuga de pollo" })])],
    summary: {
      dayTotals: { kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 5, sugars_g: null, fiber_g: null, saturated_fat_g: null, salt_g: null },
      cholesterolMg: null,
      liquid: { total: 0, drank: 0, fromFood: 0 },
    },
  });
  await render(<NutricionScreen />);
  await fireEvent.press(screen.getByText(/13:45/));
  expect(router.push).toHaveBeenCalledWith(`/nutricion/comida?id=${MEAL_ID}`);
});

test("desde el detalle se puede editar la comida", async () => {
  await render(<ComidaDetalleScreen />);
  await waitFor(() => expect(screen.getByText("Editar")).toBeTruthy());
  await fireEvent.press(screen.getByText("Editar"));
  expect(router.push).toHaveBeenCalledWith(`/nutricion/nueva-comida?mealId=${MEAL_ID}`);
});
