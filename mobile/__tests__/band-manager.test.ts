// mobile/__tests__/band-manager.test.ts
// Mock del módulo nativo: nunca se carga react-native-ble-plx real.
const mockMonitorSub = { remove: jest.fn() };
const mockDisconnectSub = { remove: jest.fn() };
const mockDevice = {
  id: "AA:BB:CC",
  name: "Polar H10",
  localName: null as string | null,
  discoverAllServicesAndCharacteristics: jest.fn().mockResolvedValue(undefined),
  monitorCharacteristicForService: jest.fn((_s?: any, _c?: any, _cb?: any) => mockMonitorSub),
};
const mockManager = {
  startDeviceScan: jest.fn(),
  stopDeviceScan: jest.fn(),
  connectToDevice: jest.fn().mockResolvedValue(mockDevice),
  cancelDeviceConnection: jest.fn().mockResolvedValue(undefined),
  onDeviceDisconnected: jest.fn(() => mockDisconnectSub),
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

test("connect usa timeout y decodifica el frame de HR por onSample", async () => {
  const bm = createBandManager();
  const samples: number[] = [];
  await bm.connect("AA:BB:CC", (bpm) => samples.push(bpm));
  expect(mockManager.connectToDevice).toHaveBeenCalledWith(
    "AA:BB:CC",
    expect.objectContaining({ timeout: expect.any(Number) }),
  );
  expect(mockDevice.discoverAllServicesAndCharacteristics).toHaveBeenCalled();
  // el monitor entrega la característica en base64 ("AEg=" = [0x00, 72] → 72 bpm)
  const monitorCb = mockDevice.monitorCharacteristicForService.mock.calls[0][2];
  monitorCb(null, { value: "AEg=" });
  expect(samples).toEqual([72]);
});

test("disconnect remueve la suscripción del monitor y cancela la conexión", async () => {
  const bm = createBandManager();
  await bm.connect("AA:BB:CC", () => {});
  await bm.disconnect();
  expect(mockMonitorSub.remove).toHaveBeenCalled();
  expect(mockManager.cancelDeviceConnection).toHaveBeenCalledWith("AA:BB:CC");
});

test("un error del monitor dispara onDisconnect y limpia la suscripción", async () => {
  const bm = createBandManager();
  const onDisc = jest.fn();
  await bm.connect("AA:BB:CC", () => {}, onDisc);
  const monitorCb = mockDevice.monitorCharacteristicForService.mock.calls[0][2];
  monitorCb(new Error("BLE drop"), null);
  expect(onDisc).toHaveBeenCalled();
  expect(mockMonitorSub.remove).toHaveBeenCalled();
});
