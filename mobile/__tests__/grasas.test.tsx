import { render, screen, fireEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import GrasasScreen from "../app/nutricion/grasas";
import { buildNutritionDaySummary } from "../src/nutrition/daySummary";
import { useNutritionDay } from "../src/nutrition/useNutritionDay";
import { FAT_BAR_ORDER } from "@pulsia/shared";

let mockOffset = "0";
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ offset: mockOffset }),
}));
jest.mock("../src/nutrition/useNutritionDay", () => ({ useNutritionDay: jest.fn() }));

// El summary se arma con el MISMO builder que usa la app, a partir de ítems (mismo criterio que
// detalle.test.tsx): un fixture inventado a mano saltearía justo la costura que suma el registro.
const item = (o: any = {}) => ({
  id: "i", foodId: null, foodName: "Comida", quantity: 100, quantityUnit: "g", grams: 100,
  kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
  saturated_fat_g: 30, monounsaturated_fat_g: 40, omega3_g: 2, omega6_g: 5, trans_fat_g: 1,
  ...o,
});
function summaryConGrasas() {
  return buildNutritionDaySummary(
    [{ id: "m", eatenAt: 1, mealType: null, note: null, items: [item()] } as any],
    [],
  );
}
const goalView = {
  status: "ok",
  kcal: { meta: 2000, comido: 1800, exercise: 0, restante: 200, over: false },
  macros: [],
};

function mockDay(over: Partial<any> = {}) {
  (useNutritionDay as jest.Mock).mockReturnValue({
    error: null, meals: [], summary: summaryConGrasas(), goalView, ...over,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOffset = "0";
  mockDay();
});

test("renderiza las 5 filas en el orden de FAT_BAR_ORDER", async () => {
  await render(<GrasasScreen />);
  // El orden real de APARICIÓN en el árbol (no solo la presencia) tiene que coincidir con
  // FAT_BAR_ORDER: getAllByTestId con regex devuelve los nodos en orden de render.
  const rows = screen.getAllByTestId(/^fat-row-/);
  expect(rows.map((r) => r.props.testID)).toEqual(FAT_BAR_ORDER.map((t) => `fat-row-${t}`));
});

test("la fila de saturada muestra el excedente y el texto 'te pasaste'", async () => {
  await render(<GrasasScreen />);
  expect(screen.getByTestId("fat-bar-saturated_fat_g-over")).toBeTruthy();
  expect(screen.getByText(/te pasaste/)).toBeTruthy();
});

test("la fila de mono (recomendada) no tiene segmento de excedente", async () => {
  await render(<GrasasScreen />);
  expect(screen.queryByTestId("fat-bar-monounsaturated_fat_g-over")).toBeNull();
});

test("tocar una fila navega a nutriente.tsx con key=<tipo> y el offset del día", async () => {
  mockOffset = "5";
  await render(<GrasasScreen />);
  await fireEvent.press(screen.getByTestId("fat-row-omega3_g"));
  expect(router.push).toHaveBeenCalledWith("/nutricion/nutriente?key=omega3_g&offset=5");
});

test("un día sin grasa cae en el EmptyState", async () => {
  mockDay({
    summary: buildNutritionDaySummary(
      [{ id: "m", eatenAt: 1, mealType: null, note: null, items: [item({
        saturated_fat_g: 0, monounsaturated_fat_g: 0, omega3_g: 0, omega6_g: 0, trans_fat_g: 0,
      })] } as any],
      [],
    ),
  });
  await render(<GrasasScreen />);
  expect(screen.getByText("Todavía no registraste grasa este día.")).toBeTruthy();
  expect(screen.queryByTestId("fat-row-saturated_fat_g")).toBeNull();
});
