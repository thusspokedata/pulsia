// mobile/src/ble/bandManager.ts
import { BleManager, type Device, type Subscription } from "react-native-ble-plx";
import { toByteArray } from "base64-js";
import { decodeHrMeasurement } from "./hrParser";

// UUIDs del perfil estándar Heart Rate (servicio 0x180D, característica 0x2A37).
const HR_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb";
const HR_CHAR = "00002a37-0000-1000-8000-00805f9b34fb";
const CONNECT_TIMEOUT_MS = 10000;

export interface FoundDevice {
  id: string;
  name: string;
}

export function createBandManager() {
  const manager = new BleManager();
  let connected: Device | null = null;
  let monitorSub: Subscription | null = null;
  let disconnectSub: Subscription | null = null;
  let connecting = false;

  // Libera las suscripciones BLE (monitor + desconexión) y olvida el device.
  function teardown(): void {
    monitorSub?.remove();
    monitorSub = null;
    disconnectSub?.remove();
    disconnectSub = null;
    connected = null;
  }

  async function disconnect(): Promise<void> {
    const dev = connected;
    teardown();
    if (dev) {
      try {
        await manager.cancelDeviceConnection(dev.id);
      } catch {
        // ya estaba desconectado: nada que hacer.
      }
    }
  }

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
    async connect(deviceId: string, onSample: (bpm: number) => void, onDisconnect?: () => void): Promise<void> {
      // Re-entrada: si ya hay (o se está armando) una sesión, cerrarla antes de abrir otra
      // para no acumular monitores duplicados.
      if (connecting || connected) await disconnect();
      connecting = true;
      manager.stopDeviceScan();
      try {
        const device = await manager.connectToDevice(deviceId, { timeout: CONNECT_TIMEOUT_MS });
        await device.discoverAllServicesAndCharacteristics();
        connected = device;
        // Desconexión del periférico (batería/rango): limpiar y avisar al consumidor.
        disconnectSub = manager.onDeviceDisconnected(device.id, () => {
          teardown();
          onDisconnect?.();
        });
        monitorSub = device.monitorCharacteristicForService(HR_SERVICE, HR_CHAR, (error, char) => {
          if (error) {
            teardown();
            onDisconnect?.();
            return;
          }
          if (!char?.value) return;
          try {
            onSample(decodeHrMeasurement(toByteArray(char.value)));
          } catch {
            // frame BLE inválido: se ignora, la sesión sigue.
          }
        });
      } finally {
        connecting = false;
      }
    },
    disconnect,
    destroy(): void {
      teardown();
      manager.destroy();
    },
  };
}

export type BandManagerHandle = ReturnType<typeof createBandManager>;
