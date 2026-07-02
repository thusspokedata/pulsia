import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// bandManager mockeado: scan entrega un dispositivo cuando se lo pide.
let mockScanCb: ((d: any) => void) | null = null;
const mockFakeManager = {
  scan: jest.fn((cb: (d: any) => void) => { mockScanCb = cb; }),
  stopScan: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  destroy: jest.fn(),
};
jest.mock("../src/ble/bandManager", () => ({ createBandManager: () => mockFakeManager }));

import ConfiguracionScreen from "../app/configuracion";

beforeEach(async () => { await AsyncStorage.clear(); mockScanCb = null; jest.clearAllMocks(); });

test("escanear, elegir una banda y verla emparejada", async () => {
  await render(<ConfiguracionScreen />);
  await waitFor(() => expect(screen.getByText("Ninguna")).toBeTruthy());

  await fireEvent.press(screen.getByText("Escanear banda"));
  // simular que el scanner encontró un dispositivo
  await waitFor(() => expect(mockFakeManager.scan).toHaveBeenCalled());
  mockScanCb!({ id: "AA:BB:CC", name: "Polar H10" });

  await waitFor(() => screen.getByTestId("band-AA:BB:CC"));
  await fireEvent.press(screen.getByTestId("band-AA:BB:CC"));

  await waitFor(async () => {
    expect(await AsyncStorage.getItem("pulsia.pairedBand")).toContain("AA:BB:CC");
  });
  expect(screen.getByText("Polar H10 (emparejada)")).toBeTruthy();
});
