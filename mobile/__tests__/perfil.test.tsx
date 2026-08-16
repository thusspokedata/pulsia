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

test("modo 'solo seguimiento' oculta los campos de entrenamiento", async () => {
  await render(<PerfilScreen />);
  // Por defecto (con plan) los campos de entrenamiento están.
  expect(screen.getByText("Objetivo")).toBeTruthy();
  expect(screen.getByTestId("perfil-days")).toBeTruthy();
  // Al pasar a "Solo seguimiento" desaparecen.
  await fireEvent.press(screen.getByTestId("chip-no"));
  expect(screen.queryByText("Objetivo")).toBeNull();
  expect(screen.queryByTestId("perfil-days")).toBeNull();
});

test("guarda en modo 'solo seguimiento' con trainingEnabled=false y sin días/min", async () => {
  await render(<PerfilScreen />);
  await fireEvent.press(screen.getByTestId("chip-no"));
  await fireEvent.press(screen.getByText("Guardar perfil"));
  await waitFor(async () => {
    const p = JSON.parse((await AsyncStorage.getItem("pulsia.profile")) as string);
    expect(p.trainingEnabled).toBe(false);
    expect(p.daysPerWeek).toBeUndefined();
    expect(p.sessionMinutes).toBeUndefined();
  });
});

test("reactivar el plan sobre un perfil 'solo seguimiento' repuebla días/min con defaults (no 'undefined')", async () => {
  // Perfil guardado sin plan → days/min ausentes. Al reabrir y volver a "Sí, con plan" los inputs
  // deben mostrar 3/45, no el string "undefined" (que rompería el guardado con Number → NaN).
  await AsyncStorage.setItem("pulsia.profile", JSON.stringify({
    experience: "beginner", goal: "general_fitness", trainingEnabled: false,
    gymEquipment: [], homeEquipment: ["bodyweight"], limitations: [],
  }));
  await render(<PerfilScreen />);
  await waitFor(() => screen.getByTestId("chip-yes"));
  await fireEvent.press(screen.getByTestId("chip-yes"));
  expect(screen.getByTestId("perfil-days").props.value).toBe("3");
  expect(screen.getByTestId("perfil-minutes").props.value).toBe("45");
});
