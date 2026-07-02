// mobile/src/ble/bandManager.ts
import { BleManager, type Device } from "react-native-ble-plx";
import { toByteArray } from "base64-js";
import { decodeHrMeasurement } from "./hrParser";

// UUIDs del perfil estándar Heart Rate (servicio 0x180D, característica 0x2A37).
const HR_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb";
const HR_CHAR = "00002a37-0000-1000-8000-00805f9b34fb";

export interface FoundDevice {
  id: string;
  name: string;
}

export function createBandManager() {
  const manager = new BleManager();
  let connected: Device | null = null;

  return {
    scan(onDevice: (d: FoundDevice) => void): void {
      manager.startDeviceScan([HR_SERVICE], null, (error, device) => {
        if (error || !device) return;
        onDevice({ id: device.id, name: device.name ?? device.localName ?? "Banda" });
      });
    },
    stopScan(): void {
      manager.stopDeviceScan();
    },
    async connect(deviceId: string, onSample: (bpm: number) => void): Promise<void> {
      manager.stopDeviceScan();
      const device = await manager.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();
      connected = device;
      device.monitorCharacteristicForService(HR_SERVICE, HR_CHAR, (error, char) => {
        if (error || !char?.value) return;
        try {
          onSample(decodeHrMeasurement(toByteArray(char.value)));
        } catch {
          // frame BLE inválido: se ignora, la sesión sigue.
        }
      });
    },
    async disconnect(): Promise<void> {
      if (connected) {
        await manager.cancelDeviceConnection(connected.id);
        connected = null;
      }
    },
    destroy(): void {
      manager.destroy();
    },
  };
}

export type BandManagerHandle = ReturnType<typeof createBandManager>;
