import { render, act, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { AppState } from "react-native";

const mockSyncPending = jest.fn();
const mockGetBackendUrl = jest.fn();
jest.mock("../src/sync/syncSessions", () => ({ syncPending: (...a: any[]) => mockSyncPending(...a) }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: (...a: any[]) => mockGetBackendUrl(...a) }));

import { useSyncPendingSessions } from "../src/sync/useSyncPendingSessions";

function Harness({ enabled }: { enabled: boolean }) {
  useSyncPendingSessions(enabled);
  return <Text>ok</Text>;
}

beforeEach(() => {
  mockSyncPending.mockReset().mockResolvedValue({ synced: 0, remaining: 0, lastError: null });
  mockGetBackendUrl.mockReset().mockResolvedValue("http://backend.test");
});

test("dispara syncPending al montar cuando está habilitado y hay url", async () => {
  render(<Harness enabled={true} />);
  await waitFor(() => expect(mockSyncPending).toHaveBeenCalledWith("http://backend.test"));
});

test("NO dispara si está deshabilitado (no autenticado)", async () => {
  render(<Harness enabled={false} />);
  // Damos margen a que el efecto corra (si fuera a disparar) sin usar `act` vacío: un `act`
  // async vacío deja el entorno de React 19 en un estado que impide que los efectos del
  // siguiente test se vacíen. Un flush de timer real preserva la intención sin ese efecto.
  await new Promise((r) => setTimeout(r, 10));
  expect(mockSyncPending).not.toHaveBeenCalled();
});

test("vuelve a disparar cuando la app pasa a 'active'", async () => {
  const listeners: Array<(s: string) => void> = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_ev: any, cb: any) => {
    listeners.push(cb);
    return { remove: () => {} } as any;
  });
  render(<Harness enabled={true} />);
  await waitFor(() => expect(mockSyncPending).toHaveBeenCalledTimes(1));
  await act(async () => { listeners.forEach((cb) => cb("active")); });
  await waitFor(() => expect(mockSyncPending).toHaveBeenCalledTimes(2));
});
