// mobile/__tests__/band-manager.test.ts
// Mock del módulo nativo: nunca se carga react-native-ble-plx real.
const mockDevice = {
  id: "AA:BB:CC",
  name: "Polar H10",
  localName: null as string | null,
  discoverAllServicesAndCharacteristics: jest.fn().mockResolvedValue(undefined),
  monitorCharacteristicForService: jest.fn(),
};
const mockManager = {
  startDeviceScan: jest.fn(),
  stopDeviceScan: jest.fn(),
  connectToDevice: jest.fn().mockResolvedValue(mockDevice),
  cancelDeviceConnection: jest.fn().mockResolvedValue(undefined),
  destroy: jest.fn(),
};
jest.mock("react-native-ble-plx", () => ({ BleManager: jest.fn(() => mockManager) }));

import { createBandManager } from "../src/ble/bandManager";

beforeEach(() => { jest.clearAllMocks(); });

test("scan reenvía los dispositivos encontrados con id y nombre", () => {
  const bm = createBandManager();
  const found: any[] = [];
  bm.scan((d) => found.push(d));
  // el manager real invocaría este callback por cada dispositivo:
  const scanCb = mockManager.startDeviceScan.mock.calls[0][2];
  scanCb(null, mockDevice);
  expect(found).toEqual([{ id: "AA:BB:CC", name: "Polar H10" }]);
});

test("connect decodifica el frame de HR y lo entrega por onSample", async () => {
  const bm = createBandManager();
  const samples: number[] = [];
  await bm.connect("AA:BB:CC", (bpm) => samples.push(bpm));
  expect(mockDevice.discoverAllServicesAndCharacteristics).toHaveBeenCalled();
  // el monitor entrega la característica en base64 ("AEg=" = [0x00, 72] → 72 bpm)
  const monitorCb = mockDevice.monitorCharacteristicForService.mock.calls[0][2];
  monitorCb(null, { value: "AEg=" });
  expect(samples).toEqual([72]);
});
