// mobile/__tests__/hr-parser.test.ts
import { decodeHrMeasurement } from "../src/ble/hrParser";

test("formato uint8 (flag bit0=0): lee el segundo byte", () => {
  expect(decodeHrMeasurement(new Uint8Array([0x00, 72]))).toBe(72);
});

test("flags de sensor-contact activos pero uint8: sigue leyendo bpm", () => {
  // flags 0b110 = sensor contact soportado+detectado, bit0=0 → uint8
  expect(decodeHrMeasurement(new Uint8Array([0x06, 65]))).toBe(65);
});

test("formato uint16 (flag bit0=1): little-endian sobre 2 bytes", () => {
  // 0x012C = 300 bpm (irreal, pero valida el decode de 16 bits)
  expect(decodeHrMeasurement(new Uint8Array([0x01, 0x2c, 0x01]))).toBe(300);
});

test("payload demasiado corto lanza error", () => {
  expect(() => decodeHrMeasurement(new Uint8Array([0x00]))).toThrow();
});
