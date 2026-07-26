import { render, screen } from "@testing-library/react-native";
import { NutrientesTab } from "../src/nutrition/tabs/NutrientesTab";
import { buildNutritionDaySummary } from "../src/nutrition/daySummary";
import type { NutritionDaySummary } from "../src/nutrition/daySummary";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

const persona = { sex: "male" as const, age: 35 };

// Con dato en al menos un nutriente: sin esto `NutrientesTab` cae en el EmptyState y ninguna de
// las dos pruebas (con/sin leyenda) tocaría el código que nos interesa.
const resumenBase = (): NutritionDaySummary => {
  const base = buildNutritionDaySummary([], []);
  return { ...base, nutrients: { ...base.nutrients, iron_mg: { value: 5, partial: false, withData: 1, total: 1 } } };
};

test("sin suplementos NO se muestra la leyenda de comida/suplemento/excedente", async () => {
  const summary = resumenBase(); // supplementNutrients: {}
  await render(<NutrientesTab summary={summary} goalView={null} persona={persona} offset={0} />);
  expect(screen.queryByTestId("nutrientes-leyenda")).toBeNull();
});

test("con algún nutriente de suplemento se muestra la leyenda con sus tres puntitos", async () => {
  const summary = { ...resumenBase(), supplementNutrients: { magnesium_mg: 300 } };
  await render(<NutrientesTab summary={summary} goalView={null} persona={persona} offset={0} />);
  expect(screen.getByTestId("nutrientes-leyenda")).toBeTruthy();
  expect(screen.getByText("Comida")).toBeTruthy();
  expect(screen.getByText("Suplemento")).toBeTruthy();
  expect(screen.getByText("Excedente")).toBeTruthy();
});
