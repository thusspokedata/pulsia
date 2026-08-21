import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { getBackendUrl } from "../storage/config";
import { syncPending } from "./syncSessions";

// Re-sincroniza la cola de sesiones pendientes de forma proactiva: al montar (app abierta)
// y cada vez que la app vuelve a primer plano. Es el arreglo del root cause de SES-1: sin esto,
// `syncPending` solo corría al terminar otra sesión, dejando entrenos encolados por días.
export function useSyncPendingSessions(enabled: boolean): void {
  const running = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function flush() {
      if (running.current) return;
      running.current = true;
      try {
        const url = await getBackendUrl();
        if (url && !cancelled) await syncPending(url);
      } catch {
        // best-effort: sin backend o red caída → se reintenta al próximo foreground
      } finally {
        running.current = false;
      }
    }
    void flush();
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") void flush();
    });
    return () => { cancelled = true; sub.remove(); };
  }, [enabled]);
}
