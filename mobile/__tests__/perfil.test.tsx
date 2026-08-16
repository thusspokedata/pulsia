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

test("cada nivel de actividad muestra una descripción no vacía y distinta", async () => {
  await render(<PerfilScreen />);
  // Sin selección todavía no hay descripción.
  expect(screen.queryByTestId("activity-desc")).toBeNull();
  const texts: string[] = [];
  for (const level of ["sedentary", "light", "moderate", "active"]) {
    await fireEvent.press(screen.getByTestId(`chip-${level}`));
    const desc = screen.getByTestId("activity-desc").props.children as string;
    expect(typeof desc).toBe("string");
    expect(desc.length).toBeGreaterThan(0);
    texts.push(desc);
  }
  // Las cuatro son distintas: atrapa una descripción vacía, faltante o duplicada en cualquier nivel.
  expect(new Set(texts).size).toBe(4);
});

test("al guardar el perfil se muestra el feedback exacto 'Datos guardados ✓'", async () => {
  await render(<PerfilScreen />);
  expect(screen.queryByTestId("perfil-saved-flash")).toBeNull();
  await fireEvent.press(screen.getByText("Guardar perfil"));
  await waitFor(() => expect(screen.getByTestId("perfil-saved-flash").props.children).toBe("Datos guardados ✓"));
});
