import { test, expect } from "bun:test";
import { reprocessActivity } from "./reprocess";
import { buildFitFixture } from "./fitFixture";

const AID = "22222222-2222-4222-8222-222222222222";
const UID = "33333333-3333-4333-8333-333333333333";

// Fake db: getCardioFitFileBytes hace select().from().innerJoin().where(); updateCardioFromFit
// hace update().set().where(). `fileBytes: null` simula que no hay .FIT guardado (join sin match).
function fakeDb(fileBytes: Buffer | null) {
  const patches: any[] = [];
  const db: any = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: async () => (fileBytes ? [{ bytes: fileBytes }] : []),
        }),
      }),
    }),
    update: () => ({
      set: (s: any) => {
        patches.push(s);
        return { where: async () => {} };
      },
    }),
  };
  return { db, patches };
}

const validFitBytes = () => Buffer.from(buildFitFixture({
  totalCalories: 321,
  hr: [{ atMs: 1_700_000_000_000, bpm: 120 }, { atMs: 1_700_000_001_000, bpm: 125 }],
}));

test("reprocessActivity con un .FIT guardado devuelve ok y el patch trae samples + el kcal del fixture", async () => {
  const { db, patches } = fakeDb(validFitBytes());
  const result = await reprocessActivity(db, AID, UID);
  expect(result).toEqual({ status: "ok" });
  expect(patches).toHaveLength(1);
  expect(patches[0].samples).toBeTruthy();
  expect(patches[0].kcal).toBe(321);
});

test("reprocessActivity NUNCA manda type/durationMs/distanceM/avgHr/notes en el patch", async () => {
  const { db, patches } = fakeDb(validFitBytes());
  await reprocessActivity(db, AID, UID);
  const patch = patches[0];
  expect(patch).not.toHaveProperty("type");
  expect(patch).not.toHaveProperty("durationMs");
  expect(patch).not.toHaveProperty("distanceM");
  expect(patch).not.toHaveProperty("avgHr");
  expect(patch).not.toHaveProperty("notes");
});

test("reprocessActivity sin archivo guardado devuelve no-file y no actualiza nada", async () => {
  const { db, patches } = fakeDb(null);
  const result = await reprocessActivity(db, AID, UID);
  expect(result).toEqual({ status: "no-file" });
  expect(patches).toHaveLength(0);
});

test("reprocessActivity con bytes que no parsean devuelve parse-error con mensaje y no actualiza nada", async () => {
  const { db, patches } = fakeDb(Buffer.from("esto no es un .FIT"));
  const result = await reprocessActivity(db, AID, UID);
  expect(result.status).toBe("parse-error");
  expect((result as { status: "parse-error"; message: string }).message).toBeTruthy();
  expect(patches).toHaveLength(0);
});

test("reprocessActivity re-deriva kcalSource: si el archivo tiene kcal, pasa a 'device'", async () => {
  // Caso del review: una actividad importada con kcal null quedó en kcalSource "estimate". Al
  // reprocesar aparece el kcal del reloj, así que la fuente TIENE que pasar a "device" — si no,
  // queda un valor medido marcado como estimado, contradiciendo la regla que el server aplica en
  // POST /cardio y el móvil en buildFitActivity.
  const { db, patches } = fakeDb(validFitBytes());
  await reprocessActivity(db, AID, UID);
  expect(patches[0].kcal).toBe(321);
  expect(patches[0].kcalSource).toBe("device");
});

test("reprocessActivity deja kcalSource en 'estimate' si el archivo no trae kcal", async () => {
  const { db, patches } = fakeDb(Buffer.from(buildFitFixture({ totalCalories: null })));
  await reprocessActivity(db, AID, UID);
  expect(patches[0].kcal ?? null).toBeNull();
  expect(patches[0].kcalSource).toBe("estimate");
});
