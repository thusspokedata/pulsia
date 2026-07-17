import { Encoder, Profile } from "@garmin/fitsdk";

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
}

// Construye un ArrayBuffer con un .FIT válido (header + CRC correctos) para tests.
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
  } = opts;

  const enc = new Encoder();
  enc.writeMesg({ mesgNum: Profile.MesgNum.FILE_ID, type: "activity", timeCreated: new Date(startTimeMs) });
  if (withSession) {
    const session: Record<string, unknown> = { mesgNum: Profile.MesgNum.SESSION, startTime: new Date(startTimeMs), sport };
    if (totalTimerTime != null) session.totalTimerTime = totalTimerTime;
    if (totalElapsedTime != null) session.totalElapsedTime = totalElapsedTime;
    if (totalDistance != null) session.totalDistance = totalDistance;
    if (totalCalories != null) session.totalCalories = totalCalories;
    if (avgHeartRate != null) session.avgHeartRate = avgHeartRate;
    if (maxHeartRate != null) session.maxHeartRate = maxHeartRate;
    if (totalAscent != null) session.totalAscent = totalAscent;
    enc.writeMesg(session);
  }
  for (const p of hr) {
    enc.writeMesg({ mesgNum: Profile.MesgNum.RECORD, timestamp: new Date(p.atMs), heartRate: p.bpm });
  }
  return enc.close();
}
