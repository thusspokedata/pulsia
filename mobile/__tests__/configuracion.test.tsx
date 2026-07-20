import { StyleSheet } from "react-native";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { saveSettings, getSettings } from "../src/api/settings";
import { reprocessAllCardio } from "../src/api/cardio";
import ConfiguracionScreen from "../app/configuracion";

jest.mock("expo-router", () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock("../src/auth/AuthContext", () => ({ useAuth: () => ({ signOut: jest.fn(async () => {}) }) }));
jest.mock("../src/api/settings", () => ({
  saveSettings: jest.fn(async () => {}),
  getSettings: jest.fn(async () => ({ hasApiKey: false, aiModel: "claude-sonnet-4-6", ecgEnabled: false, hasKardiaPw: false })),
}));
jest.mock("../src/api/cardio", () => ({ reprocessAllCardio: jest.fn() }));

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
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

test("el toggle de ECG guarda ecgEnabled y muestra password + link a /ecg al activarse", async () => {
  await render(<ConfiguracionScreen />);
  const toggle = await screen.findByTestId("ecg-toggle");
  // Desactivado por defecto: no hay campo de contraseña ni link.
  expect(screen.queryByTestId("kardia-password")).toBeNull();
  expect(screen.queryByTestId("ecg-screen-link")).toBeNull();

  await fireEvent.press(toggle);
  await waitFor(() => {
    expect(saveSettings).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ecgEnabled: true }),
    );
  });

  // Con ECG activo aparece el campo de contraseña (secureTextEntry) y el link.
  const pw = await screen.findByTestId("kardia-password");
  expect(pw.props.secureTextEntry).toBe(true);
  const link = await screen.findByTestId("ecg-screen-link");
  await fireEvent.press(link);
  expect(router.push).toHaveBeenCalledWith("/ecg");
});

test("la pantalla scrollea y deja aire abajo (secciones del fondo alcanzables)", async () => {
  await render(<ConfiguracionScreen />);
  const scroll = await screen.findByTestId("configuracion-scroll");
  const style = StyleSheet.flatten(scroll.props.contentContainerStyle);
  expect(style.paddingBottom).toBeGreaterThan(0);
  // Las secciones del fondo (las que quedaban fuera de pantalla) están renderizadas.
  expect(screen.getByTestId("reports-toggle")).toBeTruthy();
  expect(screen.getByTestId("logout")).toBeTruthy();
});

test("reprocesar actividades de Garmin: muestra el resumen al terminar", async () => {
  (reprocessAllCardio as jest.Mock).mockResolvedValue({ reprocesadas: 2, sinArchivo: 1, fallidas: 0 });
  await render(<ConfiguracionScreen />);
  await fireEvent.press(await screen.findByTestId("reprocess-garmin"));
  await waitFor(() => expect(screen.getByText("2 reprocesadas · 1 sin archivo · 0 fallidas")).toBeTruthy());
});

test("reprocesar actividades de Garmin: muestra un spinner mientras corre y lo saca al terminar", async () => {
  let resolvePromise: (v: { reprocesadas: number; sinArchivo: number; fallidas: number }) => void;
  (reprocessAllCardio as jest.Mock).mockReturnValue(
    new Promise((resolve) => { resolvePromise = resolve; }),
  );
  await render(<ConfiguracionScreen />);
  fireEvent.press(await screen.findByTestId("reprocess-garmin"));
  await waitFor(() => expect(screen.getByTestId("reprocess-garmin-spinner")).toBeTruthy());
  await act(async () => {
    resolvePromise({ reprocesadas: 0, sinArchivo: 0, fallidas: 0 });
  });
  await waitFor(() => expect(screen.queryByTestId("reprocess-garmin-spinner")).toBeNull());
});

test("reprocesar actividades de Garmin: muestra un error legible si falla", async () => {
  (reprocessAllCardio as jest.Mock).mockRejectedValue(new Error("No se pudieron reprocesar las actividades"));
  await render(<ConfiguracionScreen />);
  await fireEvent.press(await screen.findByTestId("reprocess-garmin"));
  await waitFor(() => expect(screen.getByText("No se pudieron reprocesar las actividades")).toBeTruthy());
});

test("con ECG habilitado en el backend, guarda la contraseña de Kardia al confirmar", async () => {
  (getSettings as jest.Mock).mockResolvedValueOnce({ hasApiKey: false, aiModel: "claude-sonnet-4-6", ecgEnabled: true, hasKardiaPw: false });
  await render(<ConfiguracionScreen />);
  const pw = await screen.findByTestId("kardia-password");
  await fireEvent.changeText(pw, "secreto123");
  await fireEvent(pw, "submitEditing", { nativeEvent: { text: "secreto123" } });
  await waitFor(() => {
    expect(saveSettings).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kardiaPdfPassword: "secreto123" }),
    );
  });
});
