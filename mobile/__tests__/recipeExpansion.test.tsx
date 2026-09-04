import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ macro: "protein", offset: "0" })),
}));

const mockMeals = [
  {
    id: "m",
    eatenAt: 1,
    mealType: "almuerzo",
    note: null,
    items: [
      {
        id: "i1",
        foodId: "empanada",
        foodName: "Empanada",
        quantity: 100,
        quantityUnit: "g",
        grams: 100,
        kcal: 250,
        protein_g: 12,
        carbs_g: 20,
        fat_g: 12,
      },
    ],
  },
];
jest.mock("../src/nutrition/useMealsRange", () => ({
  useMealsRange: () => ({ meals: mockMeals, loading: false, error: null }),
}));

const carne = { id: "carne", name: "Carne", basis: "per_100g", kcal: 200, protein_g: 26, carbs_g: 0, fat_g: 10, unitWeightG: null };
const cebolla = { id: "cebolla", name: "Cebolla", basis: "per_100g", kcal: 40, protein_g: 1, carbs_g: 9, fat_g: 0, unitWeightG: null };
const empanada = {
  id: "empanada",
  name: "Empanada",
  basis: "per_100g",
  kcal: 250,
  protein_g: 12,
  carbs_g: 20,
  fat_g: 12,
  unitWeightG: null,
  sourceMacros: "recipe",
  recipe: {
    items: [
      { foodId: "carne", quantity: 60, unit: "g" },
      { foodId: "cebolla", quantity: 40, unit: "g" },
    ],
    cookedWeightG: null,
  },
};
let mockCatalog = new Map<string, any>([
  ["empanada", empanada],
  ["carne", carne],
  ["cebolla", cebolla],
]);
jest.mock("../src/nutrition/useFoodCatalog", () => ({ useFoodCatalog: () => mockCatalog }));

import MacroScreen from "../app/nutricion/macro";

test("expande una receta a sus ingredientes al tocar el chevron", async () => {
  await render(<MacroScreen />);
  await waitFor(() => expect(screen.getByTestId("macro-expand-Empanada")).toBeTruthy());
  expect(screen.queryByText("Carne")).toBeNull(); // colapsado al inicio
  fireEvent.press(screen.getByTestId("macro-expand-Empanada"));
  await waitFor(() => expect(screen.getByText("Carne")).toBeTruthy());
  expect(screen.getByText("Cebolla")).toBeTruthy();
});

test("una receta con ingrediente faltante no muestra chevron", async () => {
  mockCatalog = new Map<string, any>([
    ["empanada", empanada],
    ["carne", carne],
  ]); // falta cebolla → expandRecipe.complete === false → sin chevron
  await render(<MacroScreen />);
  await waitFor(() => expect(screen.getByText("Empanada")).toBeTruthy());
  expect(screen.queryByTestId("macro-expand-Empanada")).toBeNull();
});
