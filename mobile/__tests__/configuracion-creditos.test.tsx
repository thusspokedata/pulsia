import { render, screen } from "@testing-library/react-native";
import ConfiguracionScreen from "../app/configuracion";

// La atribución a Everkinetic es una OBLIGACIÓN LEGAL de la licencia CC-BY-SA-4.0, no un
// detalle cosmético: sin esta sección no tenemos derecho a usar las ilustraciones de
// ejercicios que ya están commiteadas en el bundle. Este test existe para que un refactor
// futuro no la borre en silencio.
jest.mock("expo-router", () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock("../src/auth/AuthContext", () => ({ useAuth: () => ({ signOut: jest.fn(async () => {}) }) }));
jest.mock("../src/api/settings", () => ({
  saveSettings: jest.fn(async () => {}),
  getSettings: jest.fn(async () => ({ hasApiKey: false, aiModel: "claude-sonnet-4-6", ecgEnabled: false, hasKardiaPw: false })),
}));

test("muestra la atribución a Everkinetic y la licencia CC BY-SA 4.0", async () => {
  await render(<ConfiguracionScreen />);
  expect(await screen.findByText(/Everkinetic/)).toBeTruthy();
  expect(await screen.findByText(/CC BY-SA 4\.0/)).toBeTruthy();
});
