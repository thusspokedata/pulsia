import { test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { createApp } from "../app";
import { SINGLE_USER_ID } from "../constants";
import { buildFitFixture } from "../cardio/fitFixture";
import { cardioFitFile } from "../db/schema";

const KEY = "a".repeat(64);
const AID = "11111111-1111-4111-8111-111111111111";

const activity = {
  id: AID, type: "walk", startedAt: 1784000000000, durationMs: 1800000,
  distanceM: 2500, avgHr: 105, maxHr: 128, elevationGainM: 30,
  kcal: 140, kcalSource: "device", source: "fit", notes: "",
};

// fakeDb configurable: `rows` es lo que devuelven los SELECT de fila completa;
// `ownerId` lo que devuelve el select({userId}) de getCardioOwnerId;
// `failFileInsert` simula que el insert de cardio_fit_file explota (para probar que no rompe el 200).
function fakeDb(opts: { rows?: any[]; ownerId?: string | null; failFileInsert?: boolean } = {}) {
  const inserts: any[] = [];
  const fileInserts: any[] = [];
  const updates: any[] = [];
  const rows = opts.rows ?? [];
  const thenableRows = (data: any[]) => {
    const p: any = Promise.resolve(data);
    p.orderBy = async () => data;      // listCardio hace .where().orderBy()
    return p;
  };
  const db: any = {
    _inserts: inserts, _fileInserts: fileInserts, _updates: updates,
    // Distingue la tabla por identidad de referencia (import real de cardioFitFile), no por forma
    // de los valores: así el fake no depende de qué claves manda insertCardio/insertCardioFitFile.
    insert: (table: any) => {
      if (table === cardioFitFile) {
        return {
          values: (v: any) => ({
            onConflictDoNothing: async () => {
              if (opts.failFileInsert) throw new Error("boom: no se pudo escribir cardio_fit_file");
              fileInserts.push(v);
            },
          }),
        };
      }
      return { values: async (v: any) => { inserts.push(v); } };
    },
    // select() sin args = fila completa (getCardio/findCardioAtSecond).
    // select({...}) con `id` = listCardio (proyecta las columnas del listado, sin las pesadas).
    // select({activityId}) = la query de existencia de cardio_fit_file que hace getCardio — sin
    // archivo por default en estos fakes (ningún test de GET /cardio/:id exitoso depende de él hoy).
    // select({userId}) SIN `id`/`activityId` = getCardioOwnerId.
    // Ojo: no alcanza con "¿hay proyección?" — desde que listCardio proyecta, ese criterio la
    // confundía con getCardioOwnerId y devolvía algo sin .orderBy (500).
    select: (proj?: any) => ({
      from: () => ({
        where: (cond: any) => {
          if (proj && "activityId" in proj) return Promise.resolve([]);
          return proj && !proj.id
            ? Promise.resolve(opts.ownerId != null ? [{ userId: opts.ownerId }] : [])
            : thenableRows(rows);
        },
      }),
    }),
    update: () => ({ set: (s: any) => ({ where: () => ({ returning: async () => { updates.push(s); return rows.length ? [{ id: AID }] : []; } }) }) }),
    delete: () => ({ where: () => ({ returning: async () => (rows.length ? [{ id: AID }] : []) }) }),
  };
  return db;
}

const deps = (db: any) => ({ db, config: { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6", singleUserMode: true, sessionTtlDays: 4 }, aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) } });
// deps multi-usuario (sin single-user): exige token de sesión.
const depsAuth = (db: any) => ({ db, config: { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6", singleUserMode: false, sessionTtlDays: 4 }, aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) } });

test("POST /cardio rechaza un body inválido con 400", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/cardio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...activity, type: "yoga" }) });
  expect(res.status).toBe(400);
});

test("POST /cardio fuerza kcalSource=estimate cuando el cliente dice device sin kcal", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...activity, kcal: null, kcalSource: "device", source: "manual" }) });
  expect(res.status).toBe(200);
  expect(db._inserts[0].kcalSource).toBe("estimate");
});

test("POST /cardio con source=fit y kcal del reloj → kcalSource=device", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(activity) });
  expect(res.status).toBe(200);
  expect(db._inserts[0].kcalSource).toBe("device");
});

test("POST /cardio con source=fit y startedAt duplicado → 409", async () => {
  const db = fakeDb({ rows: [activity] }); // findCardioAtSecond encuentra una
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(activity) });
  expect(res.status).toBe(409);
});

test("POST /cardio manual NO dedupea (aunque exista una en el mismo segundo)", async () => {
  const db = fakeDb({ rows: [activity] });
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...activity, source: "manual", kcal: null, kcalSource: "estimate" }) });
  expect(res.status).toBe(200);
});

test("POST /cardio con un id que pertenece a otro usuario → 409 (no 500 por choque de PK)", async () => {
  const db = fakeDb({ ownerId: "otro-user" }); // getCardioOwnerId ve un dueño distinto
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(activity) });
  expect(res.status).toBe(409);
  expect(db._inserts.length).toBe(0);
});

test("re-POST del mismo id por el mismo usuario → 200 idempotente, SIN reinsertar", async () => {
  const db = fakeDb({ ownerId: SINGLE_USER_ID }); // el id ya existe y es del mismo usuario (retry)
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(activity) });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ id: AID });
  expect(db._inserts.length).toBe(0);
  expect(db._fileInserts.length).toBe(0);
});

// Bytes sintéticos con el magic ".FIT" en 8-11, que es lo único que mira el guardado.
// Nunca el archivo real del usuario: trae su nombre, peso, altura y FC, y el repo es público.
function fakeFitBytes(payload = "contenido de prueba, no el archivo real"): Buffer {
  return Buffer.concat([Buffer.alloc(8), Buffer.from(".FIT", "latin1"), Buffer.from(payload)]);
}

test("POST /cardio con fitBase64 y source=fit → guarda el .FIT crudo en cardio_fit_file", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const fitBytes = fakeFitBytes();
  const fitBase64 = fitBytes.toString("base64");
  const res = await app.request("/cardio", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...activity, fitBase64 }),
  });
  expect(res.status).toBe(200);
  expect(db._fileInserts).toHaveLength(1);
  const fileInsert = db._fileInserts[0];
  expect(fileInsert.activityId).toBe(AID);
  expect(fileInsert.sizeBytes).toBe(fitBytes.length);
  expect(fileInsert.sha256).toHaveLength(64);
  expect(fileInsert.sha256).toBe(createHash("sha256").update(fitBytes).digest("hex"));
  expect(fileInsert.bytes.equals(fitBytes)).toBe(true);
});

test("POST /cardio con fitBase64 que NO es un .FIT → no guarda el archivo, pero la actividad entra igual", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  // Mismo criterio de magic bytes que /parse: guardar basura arruinaría el reprocesamiento futuro.
  const noEsFit = Buffer.from("esto no es un archivo .FIT ni de casualidad").toString("base64");
  const res = await app.request("/cardio", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...activity, fitBase64: noEsFit }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ id: AID });
  expect(db._fileInserts).toHaveLength(0);
});

test("POST /cardio sin fitBase64 → no inserta archivo, sigue devolviendo 200", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(activity) });
  expect(res.status).toBe(200);
  expect(db._fileInserts).toHaveLength(0);
});

test("POST /cardio source=manual CON fitBase64 → el fitBase64 se ignora, no se guarda archivo", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const fitBase64 = Buffer.from("no debería guardarse").toString("base64");
  const res = await app.request("/cardio", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...activity, source: "manual", kcal: null, kcalSource: "estimate", fitBase64 }),
  });
  expect(res.status).toBe(200);
  expect(db._fileInserts).toHaveLength(0);
});

test("POST /cardio: si falla el insert del .FIT crudo, la actividad igual se guarda y responde 200", async () => {
  const db = fakeDb({ failFileInsert: true });
  const app = createApp(deps(db) as any);
  // Los bytes TIENEN que ser un .FIT válido: si no, maybeSaveFitFile sale por el early-return de
  // looksLikeFit y nunca llega a insertCardioFitFile, con lo que el throw simulado no se dispara
  // y este test pasaría sin ejercitar el catch que dice estar probando (falso verde).
  const fitBase64 = fakeFitBytes("archivo que va a fallar al guardarse").toString("base64");
  const res = await app.request("/cardio", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...activity, fitBase64 }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ id: AID });
  expect(db._inserts).toHaveLength(1);      // la actividad SÍ se insertó
  expect(db._fileInserts).toHaveLength(0);  // y el archivo NO (el insert explotó, se logueó y siguió)
});

test("GET /cardio/:id de otro usuario → 409 (no 404)", async () => {
  const db = fakeDb({ rows: [], ownerId: "otro-user" }); // getCardio no encuentra (no es suya), owner es otro
  const app = createApp(deps(db) as any);
  const res = await app.request(`/cardio/${AID}`);
  expect(res.status).toBe(409);
});

test("GET /cardio/:id inexistente → 404", async () => {
  const db = fakeDb({ rows: [], ownerId: null });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/cardio/${AID}`);
  expect(res.status).toBe(404);
});

test("GET /cardio SIN token (multi-usuario) devuelve 401 — no es público", async () => {
  const app = createApp(depsAuth(fakeDb()) as any);
  const res = await app.request("/cardio");
  expect(res.status).toBe(401);
});

test("GET /cardio/:id SIN token (multi-usuario) devuelve 401 — la subruta también está protegida", async () => {
  const app = createApp(depsAuth(fakeDb()) as any);
  const res = await app.request(`/cardio/${AID}`);
  expect(res.status).toBe(401);
});

test("GET /cardio con from/to no numéricos los ignora (no rompe con NaN)", async () => {
  const db = fakeDb({ rows: [activity] });
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio?from=abc&to=xyz");
  expect(res.status).toBe(200);
  expect(await res.json()).toHaveLength(1);
});

test("POST /cardio/parse devuelve el preview de un .FIT válido", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const fitB64 = Buffer.from(buildFitFixture({ sport: "walking", totalCalories: 150 })).toString("base64");
  const res = await app.request("/cardio/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fitBase64: fitB64 }),
  });
  expect(res.status).toBe(200);
  const preview = await res.json();
  expect(preview.type).toBe("walk");
  expect(preview.kcal).toBe(150);
});

test("POST /cardio/parse rechaza algo que no es .FIT con 400", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/cardio/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fitBase64: Buffer.from("no soy un fit de verdad").toString("base64") }),
  });
  expect(res.status).toBe(400);
});

test("POST /cardio/parse rechaza un base64 demasiado grande con 400", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const huge = "A".repeat(7_000_001);
  const res = await app.request("/cardio/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fitBase64: huge }),
  });
  expect(res.status).toBe(400);
  // Debe rechazar por el guard de tamaño, no por los magic bytes: un base64 de 7 MB de "A"
  // decodifica a bytes que igual fallan el magic ".FIT", así que sin este assert la mutación
  // del límite sobrevive (el 400 lo daría el otro gate). El mensaje fija el gate correcto.
  expect((await res.json()).error).toMatch(/demasiado grande/i);
});

test("POST /cardio/parse no queda capturada por /:id (orden de rutas)", async () => {
  // Con base64 vacío da 400 (lo rechaza ParseFitSchema.min(1) antes de los magic bytes): lo tomó
  // /parse. Si /:id la capturara, el POST ni siquiera matchearía (no hay POST /:id) y daría 404.
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/cardio/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fitBase64: "" }),
  });
  expect(res.status).toBe(400);
});

// fakeDb para las rutas de reproceso: getCardioFitFileBytes y listReprocessableIds hacen
// select({...}).from().innerJoin().where(), forma distinta del fakeDb de arriba (que solo
// encadena .from().where()). `fitBytes` es lo que "hay guardado" para la actividad (o null =
// sin archivo); `ids` es lo que devuelve listReprocessableIds. updateCardioFromFit no usa
// .returning(), así que .where() resuelve directo.
function fakeReprocessDb(opts: { fitBytes?: Buffer | null; ids?: string[] } = {}) {
  const updates: any[] = [];
  const db: any = {
    _updates: updates,
    select: (proj?: any) => ({
      from: () => ({
        innerJoin: () => ({
          where: async () => {
            if (proj && "bytes" in proj) return opts.fitBytes ? [{ bytes: opts.fitBytes }] : [];
            if (proj && "id" in proj) return (opts.ids ?? []).map((id) => ({ id }));
            return [];
          },
        }),
      }),
    }),
    update: () => ({ set: (s: any) => ({ where: async () => { updates.push(s); } }) }),
  };
  return db;
}

test("POST /cardio/:id/reprocess con un .FIT guardado válido → 200 status ok", async () => {
  const fitBytes = Buffer.from(buildFitFixture({ sport: "walking", totalCalories: 150 }));
  const db = fakeReprocessDb({ fitBytes });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/cardio/${AID}/reprocess`, { method: "POST" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
  expect(db._updates).toHaveLength(1);
});

test("POST /cardio/:id/reprocess sin archivo guardado → 404", async () => {
  const db = fakeReprocessDb({ fitBytes: null });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/cardio/${AID}/reprocess`, { method: "POST" });
  expect(res.status).toBe(404);
  expect((await res.json()).error).toMatch(/no tiene archivo guardado/);
});

test("POST /cardio/:id/reprocess con bytes ilegibles → 400", async () => {
  const db = fakeReprocessDb({ fitBytes: Buffer.from("esto no es un .FIT") });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/cardio/${AID}/reprocess`, { method: "POST" });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBeTruthy();
});

test("POST /cardio/reprocess-all reprocesa los ids reprocesables y devuelve los contadores", async () => {
  const fitBytes = Buffer.from(buildFitFixture({ sport: "walking", totalCalories: 150 }));
  const db = fakeReprocessDb({ ids: [AID], fitBytes });
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio/reprocess-all", { method: "POST" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ reprocesadas: 1, sinArchivo: 0, fallidas: 0 });
});

// Garantía de orden: si /:id/reprocess (o /:id sin más) capturara "reprocess-all" como :id, esta
// ruta literal nunca respondería con la forma de los contadores. Con ids vacío el resultado es
// {reprocesadas:0,...} — la forma del handler masivo, no un 404/400 del handler por-actividad.
test("POST /cardio/reprocess-all no queda capturada por /:id (ruta literal, no un :id)", async () => {
  const db = fakeReprocessDb({ ids: [] });
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio/reprocess-all", { method: "POST" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ reprocesadas: 0, sinArchivo: 0, fallidas: 0 });
});

test("re-POST del mismo id REINTENTA guardar el .FIT si la primera vez falló (auto-reparación)", async () => {
  // El retry idempotente devuelve 200 sin reinsertar la actividad, pero el archivo crudo SÍ se
  // reintenta: si no, un fallo del primer insert dejaría el binario perdido para siempre y la
  // Fase 3 (reprocesar el histórico) no tendría de dónde leer.
  const db = fakeDb({ ownerId: SINGLE_USER_ID });
  const app = createApp(deps(db) as any);
  const fitBytes = fakeFitBytes();
  const res = await app.request("/cardio", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...activity, fitBase64: fitBytes.toString("base64") }),
  });
  expect(res.status).toBe(200);
  expect(db._inserts).toHaveLength(0);      // la actividad NO se reinserta
  expect(db._fileInserts).toHaveLength(1);  // pero el archivo sí se reintenta
  expect(db._fileInserts[0].activityId).toBe(AID);
});
