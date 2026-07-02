// mobile/src/ble/hrParser.ts
// Decodifica la característica Heart Rate Measurement (GATT 0x2A37).
// Byte 0 = flags; bit 0 indica el formato del valor de HR (0 → uint8, 1 → uint16 LE).
export function decodeHrMeasurement(bytes: Uint8Array): number {
  if (bytes.length < 2) throw new Error("HR measurement demasiado corto");
  const flags = bytes[0];
  const is16 = (flags & 0x01) === 0x01;
  if (is16) {
    if (bytes.length < 3) throw new Error("HR uint16 sin segundo byte");
    return bytes[1] | (bytes[2] << 8);
  }
  return bytes[1];
}
