import { Decoder, Stream, Utils } from "@garmin/fitsdk";
import { CardioFitPreviewSchema } from "@pulsia/shared";
import type { CardioType, CardioFitPreview, CardioSamples } from "@pulsia/shared";

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

// Como intOrNull pero sin redondear (para los escalares nuevos que sí son fraccionarios, p. ej.
// trainingLoad o avgCadence).
function numOrNull(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// Para los 13 escalares nuevos (todos `.nullable().optional()`): si el campo directamente no vino
// en el mesg (.FIT viejo/simple que nunca tuvo esta clave), omitimos la key del resultado
// (`undefined`) en vez de forzar `null` — `null` queda reservado para "el reloj sí reporta esta
// sesión pero no este valor puntual", que es un caso que no observamos en la práctica pero que el
// schema deja abierto. Mismo criterio para intOrOmit.
function numOrOmit(n: unknown): number | null | undefined {
  if (n === undefined) return undefined;
  return numOrNull(n);
}
function intOrOmit(n: unknown): number | null | undefined {
  if (n === undefined) return undefined;
  return intOrNull(n);
}

// Claves de `recordMesgs` que el SDK sabe nombrar. El resto de las claves NUMÉRICAS (las que
// `includeUnknownData` expone porque el Profile público no las conoce) van a `unknown`, crudas.
const KNOWN_RECORD_KEYS = new Set([
  "timestamp",
  "heartRate",
  "cadence",
  "fractionalCadence",
  "enhancedRespirationRate",
  "cycleLength16",
]);

// Arma el stream columnar a partir de los `recordMesgs` del decoder (o, en los tests, de records
// armados a mano — ver fitFixture.ts sobre por qué el Encoder no puede sintetizar campos
// desconocidos). Descarta records anteriores a `startedAt` (mismo criterio que hrSeries: darían
// t < 0, que viola el schema). Pura y de una sola pasada por canal conocido; dos pasadas para
// `unknown` porque hay que conocer el set completo de claves antes de poder rellenar los huecos.
export function buildSamples(records: Array<Record<string, unknown>>, startedAt: number): CardioSamples | undefined {
  const kept = records.filter(
    (r) => r.timestamp instanceof Date && (r.timestamp as Date).getTime() >= startedAt,
  );
  if (kept.length === 0) return undefined;

  const unknownKeys = new Set<string>();
  for (const r of kept) {
    for (const key of Object.keys(r)) {
      if (KNOWN_RECORD_KEYS.has(key)) continue;
      if (/^\d+$/.test(key)) unknownKeys.add(key);
    }
  }

  const t: number[] = [];
  const hr: (number | null)[] = [];
  const cad: (number | null)[] = [];
  const fracCad: (number | null)[] = [];
  const resp: (number | null)[] = [];
  const cycleLen: (number | null)[] = [];
  const unknown: Record<string, (number | null)[]> = {};
  for (const key of unknownKeys) unknown[key] = [];

  for (const r of kept) {
    t.push((r.timestamp as Date).getTime() - startedAt);
    hr.push(numOrNull(r.heartRate));
    cad.push(numOrNull(r.cadence));
    fracCad.push(numOrNull(r.fractionalCadence));
    resp.push(numOrNull(r.enhancedRespirationRate));
    cycleLen.push(numOrNull(r.cycleLength16));
    for (const key of unknownKeys) unknown[key].push(numOrNull(r[key]));
  }

  return {
    t,
    hr,
    cad,
    fracCad,
    resp,
    cycleLen,
    ...(unknownKeys.size > 0 ? { unknown } : {}),
  };
}

// Parsea un .FIT a un preview. Lanza Error (mensaje legible) si no es FIT, está corrupto o no tiene
// sesión. La ruta traduce cualquier throw a un 400 — nunca un 500 con stack.
export function parseFit(buffer: Buffer): CardioFitPreview {
  const decoder = new Decoder(Stream.fromByteArray(buffer));
  if (!decoder.isFIT()) throw new Error("El archivo no es un .FIT válido");
  const { messages } = decoder.read({
    includeUnknownData: true,
    applyScaleAndOffset: true,
    expandSubFields: true,
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
  });
  const session = messages.sessionMesgs?.[0];
  if (!session) throw new Error("El .FIT no contiene una sesión de actividad");

  const startedAt = session.startTime instanceof Date ? session.startTime.getTime() : Number(session.startTime);
  if (!Number.isFinite(startedAt)) throw new Error("El .FIT no tiene una hora de inicio válida");

  const seconds = typeof session.totalTimerTime === "number" ? session.totalTimerTime
    : typeof session.totalElapsedTime === "number" ? session.totalElapsedTime : 0;
  const durationMs = Math.round(seconds * 1000);
  if (durationMs <= 0) throw new Error("El .FIT no tiene una duración válida");

  const records = (messages.recordMesgs ?? []) as unknown as Array<Record<string, unknown>>;
  // Descartamos records anteriores al inicio (FC de preparación): darían t < 0, que viola el schema.
  const hrSeries = records
    .filter((r) => typeof r.heartRate === "number" && r.timestamp instanceof Date && (r.timestamp as Date).getTime() >= startedAt)
    .map((r) => ({ t: (r.timestamp as Date).getTime() - startedAt, bpm: Math.round(r.heartRate as number) }));

  const samples = buildSamples(records, startedAt);

  // Zonas de FC: el .FIT trae una entrada de timeInZone por sesión Y por vuelta — nos quedamos con
  // la de referenceMesg === "session" (nunca con la primera del array).
  const timeInZoneMesgs = (messages.timeInZoneMesgs ?? []) as unknown as Array<Record<string, unknown>>;
  const sessionZone = timeInZoneMesgs.find((z) => z.referenceMesg === "session");
  const zones = sessionZone
    ? {
        secondsPerZone: Array.isArray(sessionZone.timeInHrZone) ? (sessionZone.timeInHrZone as number[]).map(Number) : [],
        highBoundary: Array.isArray(sessionZone.hrZoneHighBoundary)
          ? (sessionZone.hrZoneHighBoundary as number[]).map(Number)
          : [],
        maxHr: numOrNull(sessionZone.maxHeartRate),
        restingHr: numOrNull(sessionZone.restingHeartRate),
        thresholdHr: numOrNull(sessionZone.thresholdHeartRate),
        calcType: typeof sessionZone.hrCalcType === "string" ? sessionZone.hrCalcType : null,
      }
    : undefined;

  const athlete = messages.userProfileMesgs?.[0] ? { ...messages.userProfileMesgs[0] } : undefined;
  const devices = messages.deviceInfoMesgs?.length ? messages.deviceInfoMesgs.map((d) => ({ ...d })) : undefined;
  const laps = messages.lapMesgs?.length ? messages.lapMesgs.map((l) => ({ ...l })) : undefined;
  const events = messages.eventMesgs?.length ? messages.eventMesgs.map((e) => ({ ...e })) : undefined;
  const hasExtras = zones || athlete || devices || laps || events;
  const fitExtras = hasExtras ? { zones, athlete, devices, laps, events } : undefined;

  // tz del propio archivo: activityMesgs.localTimestamp (FIT-epoch, sin convertir a Date porque es
  // `localDateTime`, no `dateTime`) menos el timestamp (sí convertido a Date) de la misma actividad.
  // Nunca el offset del cliente: así importar desde un teléfono en otra zona no rompe el dato.
  const activity = messages.activityMesgs?.[0];
  const tzOffsetMinutes =
    activity && typeof activity.localTimestamp === "number" && activity.timestamp instanceof Date
      ? Math.round((activity.localTimestamp - Utils.convertDateToDateTime(activity.timestamp)) / 60)
      : undefined;

  const result = {
    // read() convierte los enums a string en runtime (convertTypesToStrings), pero los tipos
    // generados del SDK los declaran como enums numéricos: casteamos a lo que de verdad llega.
    type: mapSport(session.sport as string | undefined, session.subSport as string | undefined),
    startedAt,
    durationMs,
    distanceM: intOrNull(session.totalDistance),
    avgHr: intOrNull(session.avgHeartRate),
    maxHr: intOrNull(session.maxHeartRate),
    elevationGainM: intOrNull(session.totalAscent),
    kcal: intOrNull(session.totalCalories),
    totalCycles: intOrOmit(session.totalCycles),
    trainingLoad: numOrOmit(session.trainingLoadPeak),
    trainingEffectAerobic: numOrOmit(session.totalTrainingEffect),
    trainingEffectAnaerobic: numOrOmit(session.totalAnaerobicTrainingEffect),
    avgCadence: numOrOmit(session.avgCadence),
    maxCadence: numOrOmit(session.maxCadence),
    avgFractionalCadence: numOrOmit(session.avgFractionalCadence),
    avgRespiration: numOrOmit(session.enhancedAvgRespirationRate),
    maxRespiration: numOrOmit(session.enhancedMaxRespirationRate),
    minRespiration: numOrOmit(session.enhancedMinRespirationRate),
    metabolicKcal: intOrOmit(session.metabolicCalories),
    sportProfileName: typeof session.sportProfileName === "string" ? session.sportProfileName : undefined,
    tzOffsetMinutes,
    hrSeries: hrSeries.length > 0 ? hrSeries : undefined,
    samples,
    fitExtras,
  };
  // Validamos la salida contra el schema: cualquier invariante rota (t<0, distancia/elevación
  // negativa, etc.) es un throw acá → la ruta lo convierte en 400, nunca un preview inválido silencioso.
  return CardioFitPreviewSchema.parse(result);
}
