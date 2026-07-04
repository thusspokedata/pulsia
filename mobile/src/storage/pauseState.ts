import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "pulsia.pauseState";

// Estado de pausa de la sesión activa, persistido para sobrevivir un remontaje de la
// pantalla o un reinicio de la app (si no, el tiempo fuera se contaría como entrenamiento).
export interface PauseState {
  sessionId: string;
  pausedMs: number; // tiempo pausado acumulado (ms)
  pausedAt: number | null; // Date.now() del inicio de la pausa en curso, o null si no está pausada
}

// Devuelve el estado guardado, o null si no hay o el JSON es inválido / no tiene la forma esperada.
export async function getPauseState(): Promise<PauseState | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    if (
      json == null ||
      typeof json !== "object" ||
      typeof json.sessionId !== "string" ||
      typeof json.pausedMs !== "number" ||
      !(json.pausedAt === null || typeof json.pausedAt === "number")
    ) {
      return null;
    }
    return { sessionId: json.sessionId, pausedMs: json.pausedMs, pausedAt: json.pausedAt };
  } catch {
    return null;
  }
}

export async function setPauseState(s: PauseState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

export async function clearPauseState(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
