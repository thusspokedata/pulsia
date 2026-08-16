import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { ageFromBirthDate } from "@pulsia/shared";
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

test("guarda birthDate y deriva la edad al guardar el perfil", async () => {
  await render(<PerfilScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText("AAAA-MM-DD"), "1990-05-14");
  await fireEvent.press(screen.getByText("Guardar perfil"));
  await waitFor(async () => {
    const p = JSON.parse((await AsyncStorage.getItem("pulsia.profile")) as string);
    expect(p.birthDate).toBe("1990-05-14");
    expect(p.age).toBe(ageFromBirthDate("1990-05-14"));
  });
});

test("una birthDate inválida no guarda y muestra error", async () => {
  await render(<PerfilScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText("AAAA-MM-DD"), "14/05/1990");
  await fireEvent.press(screen.getByText("Guardar perfil"));
  await waitFor(() => expect(screen.getByText(/nacimiento inválida/i)).toBeTruthy());
  expect(await AsyncStorage.getItem("pulsia.profile")).toBeNull();
});

test("una birthDate que deriva una edad fuera de 12–100 muestra un error específico (no el genérico)", async () => {
  // Un niño (~5 años): la fecha es válida pero la edad derivada cae bajo el mínimo del perfil.
  const y = new Date().getUTCFullYear() - 5;
  await render(<PerfilScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText("AAAA-MM-DD"), `${y}-06-15`);
  await fireEvent.press(screen.getByText("Guardar perfil"));
  await waitFor(() => expect(screen.getByText(/fuera de rango/i)).toBeTruthy());
  expect(await AsyncStorage.getItem("pulsia.profile")).toBeNull();
});

test("con birthDate cargada, el perfil viejo muestra la edad derivada (no la guardada)", async () => {
  // Perfil viejo: age 20 desactualizada + birthDate de 1990. getProfile deriva la edad al leer.
  await AsyncStorage.setItem("pulsia.profile", JSON.stringify({
    experience: "beginner", goal: "general_fitness", daysPerWeek: 3, sessionMinutes: 45,
    gymEquipment: [], homeEquipment: ["bodyweight"], limitations: [], age: 20, birthDate: "1990-05-14",
  }));
  await render(<PerfilScreen />);
  const derived = ageFromBirthDate("1990-05-14")!;
  await waitFor(() =>
    expect(screen.getByTestId("perfil-derived-age").props.children).toContain(String(derived)),
  );
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
