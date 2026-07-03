// mobile/__tests__/use-heart-rate.test.tsx
import { renderHook, act, waitFor } from "@testing-library/react-native";

let mockBand: any = { deviceId: "AA:BB:CC", name: "Polar H10" };
jest.mock("../src/storage/pairedBand", () => ({
  getPairedBand: async () => mockBand,
}));

// bandManager mockeado: connect entrega un sample fijo de 88 bpm y guarda el onDisconnect.
let mockOnDisconnect: (() => void) | undefined;
const mockManager = {
  connect: jest.fn(async (_id: string, onSample: (b: number) => void, onDisconnect?: () => void) => {
    mockOnDisconnect = onDisconnect;
    onSample(88);
  }),
  disconnect: jest.fn().mockResolvedValue(undefined),
  destroy: jest.fn(),
  scan: jest.fn(),
  stopScan: jest.fn(),
};
jest.mock("../src/ble/bandManager", () => ({
  createBandManager: () => mockManager,
}));

import { useHeartRate } from "../src/ble/useHeartRate";

beforeEach(() => {
  mockBand = { deviceId: "AA:BB:CC", name: "Polar H10" };
  mockOnDisconnect = undefined;
  jest.clearAllMocks();
});

test("sin banda emparejada: status 'no-band'", async () => {
  mockBand = null;
  const { result } = await renderHook(() => useHeartRate());
  await act(async () => { await result.current.connect(); });
  expect(result.current.status).toBe("no-band");
});

test("con banda: conecta, recibe bpm/sample y refleja la desconexión", async () => {
  const { result } = await renderHook(() => useHeartRate());
  await act(async () => { await result.current.connect(); });
  await waitFor(() => expect(result.current.status).toBe("connected"));
  expect(result.current.bpm).toBe(88);
  expect(result.current.getSamples().map((s) => s.bpm)).toEqual([88]);
  // si el periférico se cae, el hook sale de "connected" en vez de quedar stale.
  await act(async () => { mockOnDisconnect?.(); });
  expect(result.current.status).toBe("disconnected");
  expect(result.current.bpm).toBeNull();
});

test("resetSamples vacía el buffer de la serie", async () => {
  const { result } = await renderHook(() => useHeartRate());
  await act(async () => { await result.current.connect(); });
  act(() => result.current.resetSamples());
  expect(result.current.getSamples()).toEqual([]);
});
