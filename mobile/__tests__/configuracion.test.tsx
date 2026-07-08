import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ConfiguracionScreen from "../app/configuracion";

jest.mock("expo-router", () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock("../src/auth/AuthContext", () => ({ useAuth: () => ({ signOut: jest.fn(async () => {}) }) }));

beforeEach(async () => {
  await AsyncStorage.clear();
});

test("guarda la URL del backend al tocar Guardar", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ hasApiKey: false, aiModel: "claude-sonnet-4-6" }) }) as any;
  await render(<ConfiguracionScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText("http://192.168.1.50:8787"), "http://10.0.0.2:8787");
  await fireEvent.press(screen.getByText("Guardar URL"));
  await waitFor(async () => {
    expect(await AsyncStorage.getItem("pulsia.backendUrl")).toBe("http://10.0.0.2:8787");
  });
});

test("el toggle de sonidos alterna y persiste el estado", async () => {
  await render(<ConfiguracionScreen />);
  // Default: habilitado.
  await waitFor(() => expect(screen.getByText("Activados")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("sounds-toggle"));
  await waitFor(async () => {
    expect(await AsyncStorage.getItem("pulsia.soundsEnabled")).toBe("0");
  });
  expect(screen.getByText("Desactivados")).toBeTruthy();
});
