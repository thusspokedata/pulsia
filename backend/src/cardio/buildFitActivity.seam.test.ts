import { test, expect } from "bun:test";
import { CardioActivitySchema, buildFitActivity } from "@pulsia/shared";
import { parseFit } from "./parseFit";
import { buildFitFixture } from "./fitFixture";

// LA COSTURA que ningún test unitario cubría: la salida REAL de parseFit (== lo que devuelve
// POST /cardio/parse) tiene que poder armarse en algo que POST /cardio acepte (CardioActivitySchema).
// El bug de "Error 400" al subir un .fit desde la web fue exactamente esto: la web mandaba el preview
// crudo + un id, sin `source` ni `kcalSource` (requeridos), y /cardio lo rechazaba.
const UUID = "11111111-1111-4111-8111-111111111111";

function previewFromFixture() {
  const bytes = buildFitFixture({
    startTimeMs: 1_700_000_000_000, sport: "walking", totalTimerTime: 1800,
    totalDistance: 2500, totalCalories: 150, avgHeartRate: 110, maxHeartRate: 130, totalAscent: 12,
    hr: [{ atMs: 1_700_000_000_000, bpm: 108 }],
  });
  return parseFit(Buffer.from(bytes));
}

test("seam: parseFit → buildFitActivity produce una CardioActivity que /cardio acepta", () => {
  const preview = previewFromFixture();
  const activity = buildFitActivity(
    preview,
    { type: preview.type, durationMs: preview.durationMs, distanceM: preview.distanceM, avgHr: preview.avgHr, notes: "" },
    UUID,
  );
  const parsed = CardioActivitySchema.safeParse(activity);
  expect(parsed.success).toBe(true);
});

test("seam guard: el atajo ingenuo {...preview, id} NO valida (era el Error 400)", () => {
  const preview = previewFromFixture();
  // Le faltan `source` y `kcalSource`, ambos requeridos → exactamente lo que /cardio rechazaba.
  const naive = { ...preview, id: UUID };
  expect(CardioActivitySchema.safeParse(naive).success).toBe(false);
});
