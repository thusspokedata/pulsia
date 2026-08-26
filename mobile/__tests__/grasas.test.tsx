import { render, screen, fireEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import GrasasScreen from "../app/nutricion/grasas";
import { buildNutritionDaySummary } from "../src/nutrition/daySummary";
import { useNutritionDay } from "../src/nutrition/useNutritionDay";
import { FAT_BAR_ORDER } from "@pulsia/shared";
import { colors } from "../src/theme/tokens";

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
  expect(screen.getAllByText(/te pasaste/).length).toBeGreaterThan(0);
});

test("la fila de mono (recomendada) no tiene segmento de excedente", async () => {
  await render(<GrasasScreen />);
  expect(screen.queryByTestId("fat-bar-monounsaturated_fat_g-over")).toBeNull();
});

test("trans (avoid): cualquier cantidad > 0 se marca como excedida y la barra es roja, no ámbar", async () => {
  await render(<GrasasScreen />);
  // avoid no tiene umbral (thresholdG null) → no hay segmento "-over" partido en una línea; el
  // rojo viene de baseColorDe pintando TODA la barra, no de un segmento de excedente aparte.
  expect(screen.queryByTestId("fat-bar-trans_fat_g-over")).toBeNull();
  expect(screen.getByTestId("fat-bar-trans_fat_g").props.style.backgroundColor).toBe(colors.danger);
  expect(screen.getByText("evitá — lo más bajo posible")).toBeTruthy();
  // 2 filas exceden con este fixture: saturada (30g > 13.3g) y trans (1g > 0, avoid).
  expect(screen.getAllByText(/te pasaste/)).toHaveLength(2);
});

test("tocar una fila navega a nutriente.tsx con key=<tipo> y el offset del día", async () => {
  mockOffset = "5";
  await render(<GrasasScreen />);
  await fireEvent.press(screen.getByTestId("fat-row-omega3_g"));
  expect(router.push).toHaveBeenCalledWith("/nutricion/nutriente?key=omega3_g&offset=5");
});

test("el aporte de suplementos suma al total del tipo y pinta el segmento violeta", async () => {
  mockDay({
    summary: { ...summaryConGrasas(), supplementNutrients: { omega3_g: 1.4 } },
  });
  await render(<GrasasScreen />);
  // Comida omega3 = 2 g (item fixture) + suplemento 1.4 g = 3.4 g combinado.
  expect(screen.getByText("3.4 g")).toBeTruthy();
  // Y aparece el segmento violeta del suplemento dentro de esa barra.
  expect(screen.getByTestId("fat-bar-omega3_g-supp")).toBeTruthy();
});

test("con aporte de suplemento aparece la leyenda violeta", async () => {
  mockDay({
    summary: { ...summaryConGrasas(), supplementNutrients: { omega3_g: 1.4 } },
  });
  await render(<GrasasScreen />);
  expect(screen.getByText("El violeta es el aporte de los suplementos.")).toBeTruthy();
});

test("sin suplementos no hay segmento violeta ni leyenda", async () => {
  await render(<GrasasScreen />);
  expect(screen.queryAllByTestId(/-supp$/)).toHaveLength(0);
  expect(screen.queryByText("El violeta es el aporte de los suplementos.")).toBeNull();
});

test("un aporte chico 100% de suplemento (base redondearía a 0%) igual pinta el violeta", async () => {
  // Regresión: mono sin comida (0 g) + una cápsula de 0.1 g contra el umbral floor (~33 g a 2000
  // kcal) hace que el % base redondee a 0 (0.1/33·100 ≈ 0.3 → 0). Reservar ancho (barSegments3)
  // evita que el violeta desaparezca dejando la barra vacía con la leyenda diciendo que hay
  // suplemento.
  mockDay({
    summary: {
      ...buildNutritionDaySummary(
        [{ id: "m", eatenAt: 1, mealType: null, note: null, items: [item({ monounsaturated_fat_g: 0 })] } as any],
        [],
      ),
      supplementNutrients: { monounsaturated_fat_g: 0.1 },
    },
  });
  await render(<GrasasScreen />);
  expect(screen.getByTestId("fat-bar-monounsaturated_fat_g-supp")).toBeTruthy();
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
