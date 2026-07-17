import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "pulsia.restState";

// Timing por serie de la sesión activa, persistido para sobrevivir un remontaje de la
// pantalla o un reinicio de la app (si no, la serie siguiente arrancaría en el instante del
// remontaje y perdería el trabajo transcurrido).
export interface RestState {
  sessionId: string;
  setStart: number; // instante en que nació la serie en curso (fin/skip del descanso o inicio de sesión)
  restUntil: number | null; // fin del descanso activo, o null si no hay descanso corriendo
}

// Devuelve el estado guardado, o null si no hay o el JSON es inválido / no tiene la forma esperada.
export async function getRestState(): Promise<RestState | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    if (
      json == null ||
      typeof json !== "object" ||
      typeof json.sessionId !== "string" ||
      typeof json.setStart !== "number" ||
      !(json.restUntil === null || typeof json.restUntil === "number")
    ) {
      return null;
    }
    return { sessionId: json.sessionId, setStart: json.setStart, restUntil: json.restUntil };
  } catch {
    return null;
  }
}

export async function setRestState(s: RestState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

export async function clearRestState(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
