import { render, screen, waitFor } from "@testing-library/react-native";
import MacroScreen from "../app/nutricion/macro";
import { listMeals } from "../src/api/nutrition";

let mockMacro = "protein";
jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ macro: mockMacro, offset: "0" }),
}));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));
jest.mock("../src/api/nutrition", () => ({ listMeals: jest.fn(async () => []) }));

const meal = (items: any[], eatenAt = 1) => ({ id: "m", eatenAt, mealType: null, note: null, items });
const item = (foodName: string, grams: number, macros: any = {}) => ({
  id: "i", foodId: null, foodName, quantity: grams, quantityUnit: "g", grams,
  kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
  saturated_fat_g: null, sugars_g: null, fiber_g: null, sodium_mg: null, cholesterol_mg: null, water_ml: null,
  ...macros,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMacro = "protein";
  (listMeals as jest.Mock).mockResolvedValue([
    meal([item("Pollo", 150, { protein_g: 45 }), item("Arroz", 100, { protein_g: 5 })]),
  ]);
});

test("rankea los alimentos por aporte del macro, con gramos aportados, % y gramos comidos", async () => {
  await render(<MacroScreen />);
  await waitFor(() => expect(screen.getByText("Pollo")).toBeTruthy());
  expect(screen.getByText("Alimentos con más proteína")).toBeTruthy();
  expect(screen.getByText("45 g · 90%")).toBeTruthy();
  expect(screen.getByText("150 g comidos")).toBeTruthy();
  expect(screen.getByText("5 g · 10%")).toBeTruthy();
});

test("el título y el desglose siguen al macro de la URL (grasa)", async () => {
  mockMacro = "fat";
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Palta", 70, { fat_g: 10.3 })])]);
  await render(<MacroScreen />);
  await waitFor(() => expect(screen.getByText("Palta")).toBeTruthy());
  expect(screen.getByText("Alimentos con más grasa")).toBeTruthy();
  expect(screen.getByText("10.3 g · 100%")).toBeTruthy();
});

test("empty state cuando no hay comidas con ese macro", async () => {
  (listMeals as jest.Mock).mockResolvedValue([]);
  await render(<MacroScreen />);
  await waitFor(() => expect(screen.getByText("Todavía no registraste comidas con proteína este día.")).toBeTruthy());
});
