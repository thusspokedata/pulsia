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

test(".fit no-fuerza: from-fit 422 → cae a cardio (parse + post)", async () => {
  vi.stubGlobal("fetch", fetchSeq(
    { status: 422, body: { error: "no es fuerza" } },     // /sessions/from-fit
    { status: 200, body: { source: "fit", startedAt: 1, kcal: 100 } }, // /cardio/parse
    { status: 200, body: { id: "c1" } },                  // /cardio
  ));
  const res = await importFile(file("caminata.fit"));
  expect(res).toMatchObject({ kind: "cardio", duplicate: false });
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

test(".csv: prueba weight/parse (vacío) luego steps/parse (con filas) → steps", async () => {
  vi.stubGlobal("fetch", fetchSeq(
    { status: 200, body: { rows: [], skipped: [] } },              // weight/parse
    { status: 200, body: { rows: [{ date: "2026-01-01" }], skipped: [] } }, // steps/parse
    { status: 200, body: { imported: 3, duplicates: 1 } },          // steps (persist)
  ));
  const res = await importFile(file("pasos.csv"));
  expect(res).toMatchObject({ kind: "steps", imported: 3, duplicates: 1 });
});

test(".csv sin match en ningún parser → lanza error de tipo desconocido", async () => {
  vi.stubGlobal("fetch", fetchSeq(
    { status: 200, body: { rows: [], skipped: [] } },
    { status: 200, body: { rows: [], skipped: [] } },
    { status: 200, body: { rows: [], skipped: [] } },
  ));
  await expect(importFile(file("raro.csv"))).rejects.toThrow(/no se pudo reconocer/i);
});
