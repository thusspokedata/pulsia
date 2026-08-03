// El catálogo de comidas es COMPARTIDO entre usuarios. El backend marca cada alimento con `mine`
// (true si lo creó quien hace el request). Regla: los controles que MUTAN un alimento solo se ven
// en los propios. Ajeno = `mine === false`; `true` o `undefined` (backend viejo) muestra el control.
import { render, screen } from "@testing-library/react-native";

// Importar `catalogo` arrastra sus imports de módulo (expo-router, storage/config, api/nutrition).
// Se mockean igual que en alimento.test.tsx: sin esto, los módulos reales rompen el `screen` de RNTL.
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));
jest.mock("../src/api/nutrition", () => ({
  listFoods: jest.fn(async () => []),
  deleteFood: jest.fn(),
}));

import { FoodRow } from "../app/nutricion/catalogo";

const base = { id: "1", name: "Banana", basis: "per_100g", kcal: 89, protein_g: 1, carbs_g: 23, fat_g: 0, unitWeightG: null, sourceMacros: "ai", sourceMicros: null, usdaFdcId: null, createdAt: 1 } as any;

test("muestra Borrar en un alimento propio (mine=true)", async () => {
  await render(<FoodRow food={{ ...base, mine: true }} onDelete={() => {}} />);
  expect(screen.getByText("Borrar")).toBeTruthy();
});
test("NO muestra Borrar en un alimento ajeno (mine=false)", async () => {
  await render(<FoodRow food={{ ...base, mine: false }} onDelete={() => {}} />);
  expect(screen.queryByText("Borrar")).toBeNull();
  expect(screen.getByText("de la familia")).toBeTruthy();
});
test("muestra Borrar si mine es undefined (retrocompat)", async () => {
  await render(<FoodRow food={{ ...base }} onDelete={() => {}} />);
  expect(screen.getByText("Borrar")).toBeTruthy();
});
