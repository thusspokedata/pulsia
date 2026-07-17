import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "pulsia.pauseState";

// Un intervalo de pausa; el último puede estar abierto (endedAt null = pausa en curso). Los
// intervalos son secuenciales y NO se solapan entre sí (por construcción de startPause/endPause):
// una pausa nueva solo se abre cuando la anterior ya se cerró.
export interface OpenPauseInterval {
  startedAt: number;
  endedAt: number | null;
}

// Estado de pausa de la sesión activa, persistido para sobrevivir un remontaje de la pantalla o un
// reinicio de la app. Los intervalos son la fuente de verdad: el total y la atribución por-serie se
// derivan de ellos (ver finishSession).
export interface PauseState {
  sessionId: string;
  intervals: OpenPauseInterval[];
}

function isInterval(x: unknown): x is OpenPauseInterval {
  return (
    x != null && typeof x === "object" &&
    typeof (x as OpenPauseInterval).startedAt === "number" &&
    ((x as OpenPauseInterval).endedAt === null || typeof (x as OpenPauseInterval).endedAt === "number")
  );
}

// Devuelve el estado guardado, o null si no hay o el JSON es inválido. Migra el formato viejo
// ({ pausedMs, pausedAt }): una pausa en curso (pausedAt != null) se preserva como intervalo
// abierto; el pausedMs ya acumulado de una sesión en vuelo se pierde (limitación conocida,
// se auto-sana en la próxima sesión).
export async function getPauseState(): Promise<PauseState | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    if (json == null || typeof json !== "object" || typeof json.sessionId !== "string") return null;
    if (Array.isArray(json.intervals)) {
      if (!json.intervals.every(isInterval)) return null;
      return { sessionId: json.sessionId, intervals: json.intervals };
    }
    // Migración del formato viejo.
    if (json.pausedAt === null || typeof json.pausedAt === "number") {
      const intervals = json.pausedAt != null ? [{ startedAt: json.pausedAt, endedAt: null }] : [];
      return { sessionId: json.sessionId, intervals };
    }
    return null;
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

// ---- Helpers puros de manipulación de intervalos ----

export function isPaused(intervals: OpenPauseInterval[]): boolean {
  const last = intervals[intervals.length - 1];
  return last != null && last.endedAt == null;
}

export function startPause(intervals: OpenPauseInterval[], now: number): OpenPauseInterval[] {
  if (isPaused(intervals)) return intervals;
  return [...intervals, { startedAt: now, endedAt: null }];
}

export function endPause(intervals: OpenPauseInterval[], now: number): OpenPauseInterval[] {
  if (!isPaused(intervals)) return intervals;
  return intervals.map((iv, i) => (i === intervals.length - 1 ? { ...iv, endedAt: now } : iv));
}

export function totalPausedMs(intervals: OpenPauseInterval[], now: number): number {
  return intervals.reduce((acc, iv) => acc + Math.max(0, (iv.endedAt ?? now) - iv.startedAt), 0);
}
