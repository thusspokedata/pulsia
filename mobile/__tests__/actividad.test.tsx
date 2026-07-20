import { render, screen, waitFor } from "@testing-library/react-native";
import ActividadScreen, { buildZoneRows } from "../app/actividad";
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

// Actividad .FIT con archivo guardado pero sin samples (importada antes de que se guardara el
// detalle rico): candidata a reprocesar. Dato inventado.
const reprocessableActivity: CardioActivity = {
  ...fitActivity,
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  hasFitFile: true,
  samples: undefined,
  fitExtras: undefined,
};

test("botón de reprocesar aparece con source=fit + hasFitFile + sin samples", async () => {
  mockId = reprocessableActivity.id;
  (getCardioById as jest.Mock).mockResolvedValue(reprocessableActivity);

  await render(<ActividadScreen />);

  await waitFor(() => expect(screen.getByTestId("reprocesar")).toBeTruthy());
});

test("botón de reprocesar NO aparece cuando la actividad ya tiene samples", async () => {
  mockId = fitActivity.id;
  (getCardioById as jest.Mock).mockResolvedValue({ ...fitActivity, hasFitFile: true });

  await render(<ActividadScreen />);

  await waitFor(() => expect(screen.getByTestId("tile-FC media")).toBeTruthy());
  expect(screen.queryByTestId("reprocesar")).toBeNull();
});

test("botón de reprocesar NO aparece para actividades manuales", async () => {
  mockId = manualActivity.id;
  (getCardioById as jest.Mock).mockResolvedValue(manualActivity);

  await render(<ActividadScreen />);

  await waitFor(() => expect(screen.getByTestId("tile-Duración")).toBeTruthy());
  expect(screen.queryByTestId("reprocesar")).toBeNull();
});

describe("buildZoneRows", () => {
  // Forma REAL de un .FIT: secondsPerZone tiene 2 entradas más que zonas (la 0 es "por debajo de
  // Z1" y la última "por encima"), y highBoundary tiene 1 más (la última es la FC máx).
  // Valores inventados. Confundir los índices corría todos los rangos un escalón e inventaba
  // una Z0 y una Z6 — que es exactamente lo que este test previene.
  const seconds = [0, 100, 200, 300, 40, 0, 0];
  const boundary = [120, 140, 160, 170, 180, 200];

  test("empieza en Z1 y termina en Z5 (sin Z0 ni Z6 espurias)", () => {
    expect(buildZoneRows(seconds, boundary).map((z) => z.name)).toEqual(["Z1", "Z2", "Z3", "Z4", "Z5"]);
  });

  test("Z1 arranca en 0 y cada zona toma su propio techo", () => {
    const rows = buildZoneRows(seconds, boundary);
    expect(rows[0].range).toBe("0–120 ppm");
    expect(rows[1].range).toBe("120–140 ppm");
    expect(rows[4].range).toBe("170–180 ppm");
  });

  test("cada zona toma su tiempo, salteando la entrada 0", () => {
    const rows = buildZoneRows(seconds, boundary);
    expect(rows.map((z) => z.seconds)).toEqual([100, 200, 300, 40, 0]);
  });

  test("arrays cortos o vacíos no rompen", () => {
    expect(buildZoneRows([], [])).toEqual([]);
    expect(buildZoneRows([0, 50], [120, 140])).toHaveLength(1);
  });
});
