import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PerfilScreen from "../app/(tabs)/perfil";

// expo-router no se puede importar de verdad bajo jest (getDevServer crashea con scriptURL null).
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

beforeEach(async () => { await AsyncStorage.clear(); });

test("guarda un perfil con los valores por defecto al tocar Guardar", async () => {
  await render(<PerfilScreen />);
  await fireEvent.press(screen.getByText("Guardar perfil"));
  await waitFor(async () => {
    const raw = await AsyncStorage.getItem("pulsia.profile");
    expect(raw).not.toBeNull();
    const p = JSON.parse(raw as string);
    expect(p.daysPerWeek).toBe(3);
    expect(p.experience).toBe("beginner");
  });
});

test("guarda la edad opcional cuando se ingresa", async () => {
  await render(<PerfilScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText("años"), "34");
  await fireEvent.press(screen.getByText("Guardar perfil"));
  await waitFor(async () => {
    const p = JSON.parse((await AsyncStorage.getItem("pulsia.profile")) as string);
    expect(p.age).toBe(34);
  });
});
