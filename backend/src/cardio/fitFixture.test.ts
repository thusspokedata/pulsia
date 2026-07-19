import { test, expect } from "bun:test";
import { Decoder, Stream } from "@garmin/fitsdk";
import { buildFitFixture } from "./fitFixture";

const START = 1_700_000_000_000;

// Decodifica con las mismas opciones que usará el parser real, para no testear contra un
// subconjunto más permisivo que el de producción.
function decode(bytes: Uint8Array) {
  const dec = new Decoder(Stream.fromByteArray(bytes));
  const { messages } = dec.read({
    includeUnknownData: true,
    applyScaleAndOffset: true,
    expandSubFields: true,
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
  });
  return messages;
}

test("buildFitFixture (includeExtras default) emite escalares nuevos, zonas, atleta, dispositivos, vueltas y eventos", () => {
  const bytes = buildFitFixture({
    startTimeMs: START,
    hr: [
      { atMs: START, bpm: 100 },
      { atMs: START + 60_000, bpm: 101 },
      { atMs: START + 120_000, bpm: 102 },
      { atMs: START + 180_000, bpm: 103 },
      { atMs: START + 240_000, bpm: 104 },
      { atMs: START + 300_000, bpm: 105 },
    ],
  });
  const messages = decode(bytes);

  const session = messages.sessionMesgs?.[0] as Record<string, unknown> | undefined;
  expect(session?.totalCycles).toBeGreaterThan(0);
  expect(session?.trainingLoadPeak).toBeGreaterThan(0);
  expect(session?.totalTrainingEffect).toBeGreaterThan(0);
  expect(session?.totalAnaerobicTrainingEffect).toBeGreaterThanOrEqual(0);
  expect(session?.avgCadence).toBeGreaterThan(0);
  expect(session?.maxCadence).toBeGreaterThan(0);
  expect(session?.avgFractionalCadence).toBeGreaterThan(0);
  expect(session?.enhancedAvgRespirationRate).toBeGreaterThan(0);
  expect(session?.enhancedMaxRespirationRate).toBeGreaterThan(0);
  expect(session?.enhancedMinRespirationRate).toBeGreaterThan(0);
  expect(session?.metabolicCalories).toBeGreaterThan(0);
  expect(session?.sportProfileName).toBe("Test Sport");
  expect(session?.numLaps).toBeGreaterThan(0);

  // Dos entradas de zonas (sesión + vuelta), como en un archivo real: el parser deberá quedarse
  // con la de referenceMesg === "session" y no con la primera del array.
  const zones = (messages.timeInZoneMesgs ?? []) as Record<string, unknown>[];
  expect(zones.map((z) => z.referenceMesg)).toEqual(expect.arrayContaining(["session", "lap"]));
  const sessionZone = zones.find((z) => z.referenceMesg === "session");
  expect((sessionZone?.timeInHrZone as number[])?.length).toBeGreaterThan(0);
  expect((sessionZone?.hrZoneHighBoundary as number[])?.length).toBeGreaterThan(0);
  expect(sessionZone?.maxHeartRate).toBeGreaterThan(0);
  expect(sessionZone?.restingHeartRate).toBeGreaterThan(0);
  expect(sessionZone?.thresholdHeartRate).toBeGreaterThan(0);
  expect(typeof sessionZone?.hrCalcType).toBe("string");

  expect((messages.userProfileMesgs?.[0] as Record<string, unknown> | undefined)?.friendlyName).toBe("Test Atleta");
  expect((messages.deviceInfoMesgs ?? []).length).toBeGreaterThanOrEqual(2);
  expect((messages.lapMesgs ?? []).length).toBeGreaterThan(0);
  expect((messages.eventMesgs ?? []).length).toBeGreaterThan(0);

  const activity = messages.activityMesgs?.[0] as Record<string, unknown> | undefined;
  expect(activity?.timestamp).toBeInstanceOf(Date);
  expect(typeof activity?.localTimestamp).toBe("number");

  const records = (messages.recordMesgs ?? []) as Record<string, unknown>[];
  expect(records).toHaveLength(6);
  expect(records.every((r) => typeof r.cadence === "number")).toBe(true);
  expect(records.every((r) => typeof r.fractionalCadence === "number")).toBe(true);
  const respCount = records.filter((r) => r.enhancedRespirationRate != null).length;
  const cycleLenCount = records.filter((r) => r.cycleLength16 != null).length;
  expect(respCount).toBeGreaterThan(0);
  expect(respCount).toBeLessThan(records.length);
  expect(cycleLenCount).toBeGreaterThan(0);
  expect(cycleLenCount).toBeLessThan(records.length);
});

test("buildFitFixture con includeExtras:false vuelve al .FIT mínimo original (sin mensajes nuevos)", () => {
  const bytes = buildFitFixture({ startTimeMs: START, includeExtras: false, hr: [{ atMs: START, bpm: 100 }] });
  const messages = decode(bytes);

  expect(messages.timeInZoneMesgs ?? []).toHaveLength(0);
  expect(messages.zonesTargetMesgs ?? []).toHaveLength(0);
  expect(messages.userProfileMesgs ?? []).toHaveLength(0);
  expect(messages.deviceInfoMesgs ?? []).toHaveLength(0);
  expect(messages.lapMesgs ?? []).toHaveLength(0);
  expect(messages.eventMesgs ?? []).toHaveLength(0);
  expect(messages.activityMesgs ?? []).toHaveLength(0);

  const session = messages.sessionMesgs?.[0] as Record<string, unknown> | undefined;
  expect(session?.totalCycles).toBeUndefined();

  const record = messages.recordMesgs?.[0] as Record<string, unknown> | undefined;
  expect(record?.cadence).toBeUndefined();
  expect(record?.enhancedRespirationRate).toBeUndefined();
});
