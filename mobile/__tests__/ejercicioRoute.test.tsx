import { render, screen } from "@testing-library/react-native";
import EjercicioScreen from "../app/ejercicio/[catalogId]";

let mockCatalogId = "barbell_bench_press";
jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ catalogId: mockCatalogId }),
  Stack: { Screen: () => null },
}));

test("renderiza el detalle del ejercicio del path param", async () => {
  mockCatalogId = "barbell_bench_press";
  await render(<EjercicioScreen />);
  expect(screen.getByText("Press de banca con barra")).toBeTruthy();
  expect(screen.getByTestId("exercise-animation")).toBeTruthy();
});

test("un ejercicio sin ilustración abre igual, sin animación", async () => {
  mockCatalogId = "kettlebell_squat";
  await render(<EjercicioScreen />);
  expect(screen.getByText("Sentadilla con kettlebell")).toBeTruthy();
  expect(screen.queryByTestId("exercise-animation")).toBeNull();
});
