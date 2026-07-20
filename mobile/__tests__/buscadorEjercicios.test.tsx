import { render, screen, fireEvent } from "@testing-library/react-native";
import EjerciciosScreen from "../app/ejercicios";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...a: unknown[]) => mockPush(...a) },
  Stack: { Screen: () => null },
}));

beforeEach(() => mockPush.mockClear());

test("filtra por texto en español", async () => {
  await render(<EjerciciosScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText(/buscar/i), "prensa");
  expect(screen.getByText("Prensa de piernas")).toBeTruthy();
  expect(screen.queryByText("Press de banca con barra")).toBeNull();
});

test("filtra también por el nombre en inglés (sirve para buscarlo en el reloj)", async () => {
  await render(<EjerciciosScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText(/buscar/i), "leg press");
  expect(screen.getByText("Prensa de piernas")).toBeTruthy();
});

test("la fila navega al detalle aunque no tenga ilustración (explorar el catálogo)", async () => {
  await render(<EjerciciosScreen />);
  // kettlebell_squat no tiene ilustración: acá la fila navega igual, a propósito.
  await fireEvent.changeText(screen.getByPlaceholderText(/buscar/i), "sentadilla con kettlebell");
  fireEvent.press(screen.getByTestId("fila-kettlebell_squat"));
  expect(mockPush).toHaveBeenCalledWith("/ejercicio/kettlebell_squat");
});
