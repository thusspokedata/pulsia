import { Decoder, Stream } from "@garmin/fitsdk";
import type { CardioType, CardioFitPreview } from "@pulsia/shared";

// Traduce el `sport` (y a veces `subSport`) del .FIT a nuestro CardioType. Aproximado a propósito:
// el usuario corrige el tipo en el preview. Garmin marca caminatas como "hiking" y la elíptica como
// fitness_equipment + subSport "elliptical".
export function mapSport(sport: string | undefined, subSport?: string): CardioType {
  if (sport === "walking" || sport === "hiking") return "walk";
  if (sport === "running") return "run";
  if (sport === "cycling") return "bike";
  if (sport === "swimming") return "swim";
  if (sport === "rowing") return "rowing";
  if (sport === "fitness_equipment" && subSport === "elliptical") return "elliptical";
  return "other";
}

// Redondea un número a entero, o null si viene null/undefined/no-finito.
function intOrNull(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;
}

// Parsea un .FIT a un preview. Lanza Error (mensaje legible) si no es FIT, está corrupto o no tiene
// sesión. La ruta traduce cualquier throw a un 400 — nunca un 500 con stack.
export function parseFit(buffer: Buffer): CardioFitPreview {
  const decoder = new Decoder(Stream.fromByteArray(buffer));
  if (!decoder.isFIT()) throw new Error("El archivo no es un .FIT válido");
  const { messages } = decoder.read();
  const session = messages.sessionMesgs?.[0];
  if (!session) throw new Error("El .FIT no contiene una sesión de actividad");

  const startedAt = session.startTime instanceof Date ? session.startTime.getTime() : Number(session.startTime);
  if (!Number.isFinite(startedAt)) throw new Error("El .FIT no tiene una hora de inicio válida");

  const seconds = typeof session.totalTimerTime === "number" ? session.totalTimerTime
    : typeof session.totalElapsedTime === "number" ? session.totalElapsedTime : 0;
  const durationMs = Math.round(seconds * 1000);
  if (durationMs <= 0) throw new Error("El .FIT no tiene una duración válida");

  const records: any[] = messages.recordMesgs ?? [];
  const hrSeries = records
    .filter((r) => typeof r.heartRate === "number" && r.timestamp instanceof Date)
    .map((r) => ({ t: (r.timestamp as Date).getTime() - startedAt, bpm: Math.round(r.heartRate) }));

  return {
    type: mapSport(session.sport, session.subSport),
    startedAt,
    durationMs,
    distanceM: intOrNull(session.totalDistance),
    avgHr: intOrNull(session.avgHeartRate),
    maxHr: intOrNull(session.maxHeartRate),
    elevationGainM: intOrNull(session.totalAscent),
    kcal: intOrNull(session.totalCalories),
    hrSeries: hrSeries.length > 0 ? hrSeries : undefined,
  };
}
