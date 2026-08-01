import { buildFitActivity, type CardioFitPreview } from "@pulsia/shared";
import { apiFetch, ApiError } from "../api/client";
import { classifyByExtension } from "./classify";

export interface ImportResult {
  kind: "cardio" | "strength" | "weight" | "steps" | "sleep";
  imported?: number;
  duplicates?: number;
  duplicate?: boolean;
}

const CSV_TYPES = ["weight", "steps", "sleep"] as const;
type CsvType = (typeof CSV_TYPES)[number];

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function importFit(fitBase64: string): Promise<ImportResult> {
  // Fuerza primero: /sessions/from-fit toma el .fit crudo y persiste, o 422 si no es fuerza.
  const id = crypto.randomUUID();
  try {
    await apiFetch("/sessions/from-fit", { method: "POST", body: { fitBase64, id, location: "gym" } });
    return { kind: "strength" };
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 422) throw e;
  }
  // No es fuerza → cardio: parsear (sin persistir) y armar la CardioActivity con la MISMA
  // transformación que el móvil (`buildFitActivity` en @pulsia/shared). El preview crudo NO es una
  // CardioActivity válida: le faltan `source` y `kcalSource` (requeridos), y armarlos a mano acá
  // volvería a arrastrar el bug de "un campo olvidado = NULL para siempre". En batch no hay form, así
  // que los campos editables salen del propio preview.
  const preview = await apiFetch<CardioFitPreview>("/cardio/parse", { method: "POST", body: { fitBase64 } });
  const activity = buildFitActivity(
    preview,
    { type: preview.type, durationMs: preview.durationMs, distanceM: preview.distanceM, avgHr: preview.avgHr, notes: "" },
    crypto.randomUUID(),
  );
  try {
    await apiFetch("/cardio", { method: "POST", body: { ...activity, fitBase64 } });
    return { kind: "cardio", duplicate: false };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return { kind: "cardio", duplicate: true };
    throw e;
  }
}

async function importCsv(csvBase64: string): Promise<ImportResult> {
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  // Probar cada parser (no persiste); el primero que devuelve filas define el tipo.
  for (const type of CSV_TYPES) {
    const preview = await apiFetch<{ rows: unknown[] }>(`/metrics/import/${type}/parse`, {
      method: "POST", body: { csvBase64, tzOffsetMinutes },
    });
    if (preview.rows.length > 0) {
      const res = await apiFetch<{ imported: number; duplicates: number }>(`/metrics/import/${type}`, {
        method: "POST", body: { csvBase64, tzOffsetMinutes },
      });
      return { kind: type as CsvType, imported: res.imported, duplicates: res.duplicates };
    }
  }
  throw new Error("No se pudo reconocer el tipo de CSV");
}

export async function importFile(file: File): Promise<ImportResult> {
  const kind = classifyByExtension(file.name);
  if (kind === "unknown") throw new Error("Tipo de archivo no soportado");
  const base64 = await fileToBase64(file);
  return kind === "fit" ? importFit(base64) : importCsv(base64);
}
