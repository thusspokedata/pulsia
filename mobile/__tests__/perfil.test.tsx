import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
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

test("guarda el sexo elegido en el perfil", async () => {
  await render(<PerfilScreen />);
  await fireEvent.press(screen.getByTestId("chip-female"));
  await fireEvent.press(screen.getByText("Guardar perfil"));
  await waitFor(async () => {
    const p = JSON.parse((await AsyncStorage.getItem("pulsia.profile")) as string);
    expect(p.sex).toBe("female");
  });
});

test("el link de memoria navega a /memoria", async () => {
  await render(<PerfilScreen />);
  await waitFor(() => screen.getByTestId("perfil-memoria-link"));
  await fireEvent.press(screen.getByTestId("perfil-memoria-link"));
  expect(router.push).toHaveBeenCalledWith("/memoria");
});

test("al elegir un nivel de actividad se muestra su descripción", async () => {
  await render(<PerfilScreen />);
  // Sin selección todavía no hay descripción.
  expect(screen.queryByTestId("activity-desc")).toBeNull();
  await fireEvent.press(screen.getByTestId("chip-moderate"));
  const desc = screen.getByTestId("activity-desc");
  expect(desc.props.children).toBeTruthy();
  // Cambiar de nivel cambia la descripción.
  const moderateText = desc.props.children;
  await fireEvent.press(screen.getByTestId("chip-sedentary"));
  expect(screen.getByTestId("activity-desc").props.children).not.toBe(moderateText);
});

test("al guardar el perfil se muestra el feedback 'Datos guardados'", async () => {
  await render(<PerfilScreen />);
  expect(screen.queryByTestId("perfil-saved-flash")).toBeNull();
  await fireEvent.press(screen.getByText("Guardar perfil"));
  await waitFor(() => expect(screen.getByTestId("perfil-saved-flash")).toBeTruthy());
});
