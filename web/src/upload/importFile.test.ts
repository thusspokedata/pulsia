import { importFile } from "./importFile";

// Helper: File a partir de contenido + nombre.
const file = (name: string, content = "x") => new File([content], name);

function fetchSeq(...responses: Array<{ status: number; body: unknown }>) {
  const f = vi.fn();
  for (const r of responses) {
    f.mockResolvedValueOnce({ ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body });
  }
  return f;
}

test(".fit de fuerza: from-fit responde 200 → strength", async () => {
  vi.stubGlobal("fetch", fetchSeq({ status: 200, body: { id: "s1" } }));
  const res = await importFile(file("entreno.fit"));
  expect(res).toMatchObject({ kind: "strength" });
});

test(".fit de fuerza ya importado: from-fit 409 → strength duplicate:true", async () => {
  vi.stubGlobal("fetch", fetchSeq({ status: 409, body: { error: "Ya importaste este entrenamiento" } }));
  const res = await importFile(file("entreno.fit"));
  expect(res).toMatchObject({ kind: "strength", duplicate: true });
});

test(".fit no-fuerza: from-fit 422 → cae a cardio (parse + post con source/kcalSource)", async () => {
  // El preview de /cardio/parse NO trae source ni kcalSource; buildFitActivity los agrega.
  const preview = { type: "walk", startedAt: 1_700_000_000_000, durationMs: 1_800_000, distanceM: 2500, avgHr: 110, maxHr: 130, elevationGainM: 12, kcal: 150 };
  const f = fetchSeq(
    { status: 422, body: { error: "no es fuerza" } },  // /sessions/from-fit
    { status: 200, body: preview },                     // /cardio/parse
    { status: 200, body: { id: "c1" } },                // /cardio
  );
  vi.stubGlobal("fetch", f);
  const res = await importFile(file("caminata.fit"));
  expect(res).toMatchObject({ kind: "cardio", duplicate: false });

  // Regresión del "Error 400": el body que va a /cardio debe ser una CardioActivity completa,
  // no el preview crudo. En particular DEBE traer source:"fit" y kcalSource (requeridos por el schema).
  const cardioCall = f.mock.calls[2]; // 3ra llamada = POST /cardio
  expect(cardioCall[0]).toBe("/cardio");
  const body = JSON.parse(cardioCall[1].body);
  expect(body.source).toBe("fit");
  expect(body.kcalSource).toBe("device"); // kcal != null → device
  expect(body.type).toBe("walk");
  expect(typeof body.id).toBe("string");
});

test(".fit cardio duplicado: /cardio responde 409 → duplicate:true", async () => {
  vi.stubGlobal("fetch", fetchSeq(
    { status: 422, body: { error: "no es fuerza" } },
    { status: 200, body: { source: "fit", startedAt: 1 } },
    { status: 409, body: { error: "Ya importaste esta actividad" } },
  ));
  const res = await importFile(file("caminata.fit"));
  expect(res).toMatchObject({ kind: "cardio", duplicate: true });
});

test(".csv: weight/parse tira 400 (no es peso) → sigue a steps/parse (con filas) → steps", async () => {
  // Costura real: el endpoint /parse devuelve 400 cuando su parser no reconoce el CSV, NO {rows:[]}.
  // El parser de peso se prueba primero; un Steps.csv le tira 400 y el probe debe seguir a steps.
  vi.stubGlobal("fetch", fetchSeq(
    { status: 400, body: { error: "No se pudo leer ninguna medición del CSV" } }, // weight/parse (no es peso)
    { status: 200, body: { rows: [{ date: "2026-01-01" }], skipped: [] } },       // steps/parse (con filas)
    { status: 200, body: { imported: 3, duplicates: 1 } },                        // steps (persist)
  ));
  const res = await importFile(file("pasos.csv"));
  expect(res).toMatchObject({ kind: "steps", imported: 3, duplicates: 1 });
});

test(".csv que ningún parser reconoce (los 3 tiran 400) → error de tipo desconocido", async () => {
  vi.stubGlobal("fetch", fetchSeq(
    { status: 400, body: { error: "No se pudo leer ninguna medición del CSV" } },
    { status: 400, body: { error: "No se pudo leer ninguna medición del CSV" } },
    { status: 400, body: { error: "No se pudo leer ninguna medición del CSV" } },
  ));
  await expect(importFile(file("raro.csv"))).rejects.toThrow(/no se pudo reconocer/i);
});
