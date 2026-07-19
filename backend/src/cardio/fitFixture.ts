import { Encoder, Profile, Utils } from "@garmin/fitsdk";

export interface FitFixtureOpts {
  startTimeMs?: number;
  sport?: string;
  totalTimerTime?: number | null; // segundos; null lo omite del mesg (para forzar el fallback)
  totalElapsedTime?: number; // segundos; se escribe solo si viene (fallback de totalTimerTime)
  totalDistance?: number | null; // metros
  totalCalories?: number | null;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  totalAscent?: number | null;
  hr?: { atMs: number; bpm: number }[]; // record mesgs
  withSession?: boolean; // default true

  // ── Fase 1 (captura total) ──────────────────────────────────────────────────────────────
  // Prende/apaga TODO lo de abajo de una: timeInZone/zonesTarget/userProfile/deviceInfo/lap/event/
  // activity, los 13 escalares nuevos de sesión, y los canales extra (dispersos) en los records.
  // Default ON porque así es como luce un .FIT real (ver spec) y porque ningún test existente
  // depende de la ausencia de estos mensajes. `includeExtras: false` reproduce el .FIT mínimo de
  // antes de esta fase — lo usa el test de "archivo sin mensajes opcionales sigue parseando".
  includeExtras?: boolean;
  // activityMesgs.localTimestamp − timestamp, en segundos. Default +2h (mismo offset que el
  // archivo real que motivó esta fase).
  localOffsetSec?: number;

  totalCycles?: number | null;
  trainingLoadPeak?: number | null;
  totalTrainingEffect?: number | null;
  totalAnaerobicTrainingEffect?: number | null;
  avgCadence?: number | null;
  maxCadence?: number | null;
  avgFractionalCadence?: number | null;
  enhancedAvgRespirationRate?: number | null;
  enhancedMaxRespirationRate?: number | null;
  enhancedMinRespirationRate?: number | null;
  metabolicCalories?: number | null;
  sportProfileName?: string | null;
  numLaps?: number | null;
}

// Construye un ArrayBuffer con un .FIT válido (header + CRC correctos) para tests.
//
// NOTA sobre campos desconocidos: el .FIT real trae claves numéricas sin nombre en el Profile
// (p. ej. "135"/"136"/"143"/"144" en los records) que el decoder expone con `includeUnknownData`.
// El `Encoder` del SDK NO permite sintetizarlas: resuelve cada campo del mesg buscando por NOMBRE
// en `Profile.messages[mesgNum].fields` (ver mesg-definition.js) y descarta en silencio cualquier
// clave que no matchee un `fieldProfile.name` conocido — no hay forma de forzar un field number
// arbitrario vía `writeMesg`. Por eso la cobertura de `unknown` en el parser (Task 3) se testea
// con un helper puro (`buildSamples`) contra records armados a mano, sin pasar por este fixture.
export function buildFitFixture(opts: FitFixtureOpts = {}): Uint8Array {
  const {
    startTimeMs = 1_700_000_000_000,
    sport = "walking",
    totalTimerTime = 1800,
    totalElapsedTime,
    totalDistance = 2500,
    totalCalories = 150,
    avgHeartRate = 110,
    maxHeartRate = 130,
    totalAscent = 12,
    hr = [],
    withSession = true,
    includeExtras = true,
    localOffsetSec = 7200,
    totalCycles = 500,
    trainingLoadPeak = 80,
    totalTrainingEffect = 3.2,
    totalAnaerobicTrainingEffect = 0.4,
    avgCadence = 70,
    maxCadence = 90,
    avgFractionalCadence = 0.5,
    enhancedAvgRespirationRate = 28,
    enhancedMaxRespirationRate = 34,
    enhancedMinRespirationRate = 20,
    metabolicCalories = 40,
    sportProfileName = "Test Sport",
    numLaps = 1,
  } = opts;

  const enc = new Encoder();
  // Los tipos generados del SDK (Encodable<Mesg>) no modelan el patrón documentado de la propia API:
  // un objeto con `mesgNum` + campos por nombre. Casteamos en un único punto (código de test).
  const writeMesg = (m: Record<string, unknown>) => enc.writeMesg(m as unknown as Parameters<typeof enc.writeMesg>[0]);
  writeMesg({ mesgNum: Profile.MesgNum.FILE_ID, type: "activity", timeCreated: new Date(startTimeMs) });

  if (withSession) {
    const session: Record<string, unknown> = { mesgNum: Profile.MesgNum.SESSION, startTime: new Date(startTimeMs), sport };
    if (totalTimerTime != null) session.totalTimerTime = totalTimerTime;
    if (totalElapsedTime != null) session.totalElapsedTime = totalElapsedTime;
    if (totalDistance != null) session.totalDistance = totalDistance;
    if (totalCalories != null) session.totalCalories = totalCalories;
    if (avgHeartRate != null) session.avgHeartRate = avgHeartRate;
    if (maxHeartRate != null) session.maxHeartRate = maxHeartRate;
    if (totalAscent != null) session.totalAscent = totalAscent;
    if (includeExtras) {
      if (totalCycles != null) session.totalCycles = totalCycles;
      if (trainingLoadPeak != null) session.trainingLoadPeak = trainingLoadPeak;
      if (totalTrainingEffect != null) session.totalTrainingEffect = totalTrainingEffect;
      if (totalAnaerobicTrainingEffect != null) session.totalAnaerobicTrainingEffect = totalAnaerobicTrainingEffect;
      if (avgCadence != null) session.avgCadence = avgCadence;
      if (maxCadence != null) session.maxCadence = maxCadence;
      if (avgFractionalCadence != null) session.avgFractionalCadence = avgFractionalCadence;
      if (enhancedAvgRespirationRate != null) session.enhancedAvgRespirationRate = enhancedAvgRespirationRate;
      if (enhancedMaxRespirationRate != null) session.enhancedMaxRespirationRate = enhancedMaxRespirationRate;
      if (enhancedMinRespirationRate != null) session.enhancedMinRespirationRate = enhancedMinRespirationRate;
      if (metabolicCalories != null) session.metabolicCalories = metabolicCalories;
      if (sportProfileName != null) session.sportProfileName = sportProfileName;
      if (numLaps != null) session.numLaps = numLaps;
    }
    writeMesg(session);
  }

  if (includeExtras) {
    // Dos entradas de zonas, como en un archivo real (una por vuelta + una por sesión): el parser
    // debe quedarse con la de referenceMesg === "session", no con la primera del array.
    writeMesg({
      mesgNum: Profile.MesgNum.TIME_IN_ZONE,
      timestamp: new Date(startTimeMs),
      referenceMesg: "lap",
      referenceIndex: 0,
      timeInHrZone: [30, 60, 90, 10],
      hrZoneHighBoundary: [100, 130, 150, 180],
      hrCalcType: "percentMaxHr",
      maxHeartRate: 180,
      restingHeartRate: 55,
      thresholdHeartRate: 150,
    });
    writeMesg({
      mesgNum: Profile.MesgNum.TIME_IN_ZONE,
      timestamp: new Date(startTimeMs),
      referenceMesg: "session",
      referenceIndex: 0,
      timeInHrZone: [60, 120, 180, 20],
      hrZoneHighBoundary: [100, 130, 150, 180],
      hrCalcType: "percentMaxHr",
      maxHeartRate: 180,
      restingHeartRate: 55,
      thresholdHeartRate: 150,
    });

    writeMesg({
      mesgNum: Profile.MesgNum.ZONES_TARGET,
      maxHeartRate: 180,
      thresholdHeartRate: 150,
      hrCalcType: "percentMaxHr",
    });

    writeMesg({
      mesgNum: Profile.MesgNum.USER_PROFILE,
      friendlyName: "Test Atleta",
      gender: "male",
      age: 40,
      height: 1.75,
      weight: 70,
      restingHeartRate: 55,
    });

    // Dos dispositivos, para cubrir el array de fitExtras.devices.
    writeMesg({
      mesgNum: Profile.MesgNum.DEVICE_INFO,
      timestamp: new Date(startTimeMs),
      deviceIndex: 1,
      manufacturer: "garmin",
      product: 1111,
      softwareVersion: 10,
      serialNumber: 111,
    });
    writeMesg({
      mesgNum: Profile.MesgNum.DEVICE_INFO,
      timestamp: new Date(startTimeMs),
      deviceIndex: 2,
      manufacturer: "garmin",
      product: 2222,
      softwareVersion: 20,
      serialNumber: 222,
    });

    writeMesg({
      mesgNum: Profile.MesgNum.LAP,
      timestamp: new Date(startTimeMs + 900_000),
      startTime: new Date(startTimeMs),
      totalElapsedTime: 900,
      totalTimerTime: 900,
      totalDistance: Math.round((totalDistance ?? 0) / 2),
      avgHeartRate: avgHeartRate ?? undefined,
      maxHeartRate: maxHeartRate ?? undefined,
    });

    writeMesg({ mesgNum: Profile.MesgNum.EVENT, timestamp: new Date(startTimeMs), event: "timer", eventType: "start" });
    writeMesg({
      mesgNum: Profile.MesgNum.EVENT,
      timestamp: new Date(startTimeMs + 1_800_000),
      event: "timer",
      eventType: "stopAll",
    });

    // `localTimestamp` es de tipo `localDateTime`, no `dateTime`: el Encoder solo aplica la
    // conversión Date→FIT-epoch cuando `fieldDefinition.type === "dateTime"` (ver encoder.js
    // #transformValues). Hay que pasarlo ya convertido a segundos-FIT + el offset, a mano.
    const activityTimestamp = new Date(startTimeMs + 1_800_000);
    const localTimestamp = Utils.convertDateToDateTime(activityTimestamp) + localOffsetSec;
    writeMesg({
      mesgNum: Profile.MesgNum.ACTIVITY,
      timestamp: activityTimestamp,
      localTimestamp,
      totalTimerTime: totalTimerTime ?? totalElapsedTime ?? 0,
      numSessions: 1,
      type: "manual",
      event: "activity",
      eventType: "stop",
    });
  }

  hr.forEach((p, i) => {
    const rec: Record<string, unknown> = { mesgNum: Profile.MesgNum.RECORD, timestamp: new Date(p.atMs), heartRate: p.bpm };
    if (includeExtras) {
      // Cadencia densa (presente en todos los records); respiración y largo de ciclo dispersos
      // a propósito, para poder testear los huecos por canal.
      rec.cadence = 70 + (i % 10);
      rec.fractionalCadence = 0.1 * (i % 10);
      if (i % 3 === 0) rec.enhancedRespirationRate = 28 + (i % 5);
      if (i % 4 === 0) rec.cycleLength16 = 1.1 + 0.01 * i;
    }
    writeMesg(rec);
  });

  return enc.close();
}
