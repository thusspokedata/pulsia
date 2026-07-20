import { render, screen, waitFor } from "@testing-library/react-native";
import ActividadScreen from "../app/actividad";
import { getCardioById } from "../src/api/cardio";
import type { CardioActivity } from "@pulsia/shared";

let mockId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: mockId }),
}));
jest.mock("../src/api/cardio", () => ({ getCardioById: jest.fn() }));
jest.mock("../src/storage/config", () => ({
  getBackendUrl: jest.fn(async () => "http://backend.test"),
}));

// Actividad manual: sin samples ni fitExtras — lo único que trae es lo que el usuario cargó a mano.
const manualActivity: CardioActivity = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  type: "walk",
  startedAt: 1782900000000,
  durationMs: 1800000,
  distanceM: null,
  avgHr: null,
  maxHr: null,
  elevationGainM: null,
  kcal: null,
  kcalSource: "estimate",
  source: "manual",
  notes: "",
};

// Actividad importada de un .FIT sintético (dato inventado, no de un reloj real): trae samples
// de FC/cadencia, el canal 143 (Body Battery inferido) y zonas de FC con tiempo real repartido.
const fitActivity: CardioActivity = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  type: "run",
  startedAt: 1782950000000,
  durationMs: 1800000,
  distanceM: 5000,
  avgHr: 140,
  maxHr: 165,
  elevationGainM: 30,
  kcal: 320,
  avgCadence: 82,
  maxCadence: 90,
  kcalSource: "device",
  source: "fit",
  notes: "",
  samples: {
    t: [0, 60000, 120000],
    hr: [120, 140, 150],
    cad: [78, 82, 85],
    unknown: { "143": [80, 70, 60] },
  },
  fitExtras: {
    zones: {
      secondsPerZone: [0, 300, 600, 500, 200, 0],
      highBoundary: [100, 120, 140, 160, 180, 200],
      maxHr: 190,
      restingHr: 55,
      thresholdHr: 150,
      calcType: "percentMaxHr",
    },
    athlete: { weight: 70, height: 1.75, restingHeartRate: 55 },
    devices: [
      { garminProduct: 1111, manufacturer: "garmin" },
      { antplusDeviceType: "heartRate", batteryLevel: 80 },
    ],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

test("actividad manual: monta sin explotar, muestra el tile de Duración y no muestra zonas ni Body Battery", async () => {
  mockId = manualActivity.id;
  (getCardioById as jest.Mock).mockResolvedValue(manualActivity);

  await render(<ActividadScreen />);

  await waitFor(() => expect(screen.getByTestId("tile-Duración")).toBeTruthy());
  expect(screen.queryByText(/Tiempo en zonas/)).toBeNull();
  expect(screen.queryByText(/Body Battery/)).toBeNull();
});

test("actividad .FIT: muestra tiles de FC y cadencia, tiempo en zonas y la nota de Body Battery", async () => {
  mockId = fitActivity.id;
  (getCardioById as jest.Mock).mockResolvedValue(fitActivity);

  await render(<ActividadScreen />);

  await waitFor(() => expect(screen.getByTestId("tile-FC media")).toBeTruthy());
  expect(screen.getByTestId("tile-Cadencia media")).toBeTruthy();
  expect(screen.getByText(/Tiempo en zonas/)).toBeTruthy();
  expect(screen.getByText(/coincide con Body Battery/)).toBeTruthy();
});
