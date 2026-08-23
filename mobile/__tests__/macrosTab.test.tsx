import { render, screen, fireEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import { MacrosTab } from "../src/nutrition/tabs/MacrosTab";
import { buildNutritionDaySummary } from "../src/nutrition/daySummary";
import type { NutritionDaySummary } from "../src/nutrition/daySummary";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

// Un día con macros: sin esto MacrosTab cae en el EmptyState y no hay filas que tocar.
const summaryWithMacros = (): NutritionDaySummary => {
  const base = buildNutritionDaySummary([], []);
  return { ...base, dayTotals: { ...base.dayTotals, protein_g: 100, carbs_g: 100, fat_g: 22 } };
};

beforeEach(() => jest.clearAllMocks());

test("proteína y carbos navegan a su desglose de alimentos, con el offset del día", async () => {
  await render(<MacrosTab summary={summaryWithMacros()} goalView={null} offset={3} />);
  await fireEvent.press(screen.getByTestId("macro-row-protein"));
  expect(router.push).toHaveBeenCalledWith("/nutricion/macro?macro=protein&offset=3");
  await fireEvent.press(screen.getByTestId("macro-row-carbs"));
  expect(router.push).toHaveBeenCalledWith("/nutricion/macro?macro=carbs&offset=3");
});

test("grasa navega al desglose por tipo (grasas.tsx), no al ranking genérico de alimentos", async () => {
  await render(<MacrosTab summary={summaryWithMacros()} goalView={null} offset={3} />);
  await fireEvent.press(screen.getByTestId("macro-row-fat"));
  expect(router.push).toHaveBeenCalledWith("/nutricion/grasas?offset=3");
});

test("muestra el hint de que se puede tocar un macro", async () => {
  await render(<MacrosTab summary={summaryWithMacros()} goalView={null} offset={0} />);
  expect(screen.getByText("Tocá un macro para ver qué alimentos lo aportan.")).toBeTruthy();
});

test("un día sin macros cae en el EmptyState, sin filas tappables", async () => {
  await render(<MacrosTab summary={buildNutritionDaySummary([], [])} goalView={null} offset={0} />);
  expect(screen.getByText("Todavía no registraste comidas este día.")).toBeTruthy();
  expect(screen.queryByTestId("macro-row-protein")).toBeNull();
});
