import { apiFetch } from "./client";
import type { CardioActivity, CardioFitPreview } from "@pulsia/shared";

// Trae las actividades de cardio del usuario. Sin rango devuelve todo; con from/to
// (epoch ms) el backend filtra por startedAt.
export async function listCardio(baseUrl: string, from?: number, to?: number): Promise<CardioActivity[]> {
  const qs = from != null && to != null ? `?from=${from}&to=${to}` : "";
  const res = await apiFetch(baseUrl, `/cardio${qs}`);
  if (!res.ok) throw new Error("No se pudieron cargar las actividades");
  return (await res.json()) as CardioActivity[];
}

// Crea una actividad de cardio. El backend devuelve 409 si ya existe una en ese momento
// (dedupe por solape temporal), que traducimos a un mensaje específico.
// `fitBase64` es opcional: al confirmar un import .FIT, la pantalla ya tiene el archivo en
// memoria (no lo relee) y lo manda junto al POST para que el server guarde el binario crudo
// (ver POST /cardio en el backend). En alta manual no se pasa, y la clave no viaja en el body.
export async function createCardio(baseUrl: string, activity: CardioActivity, fitBase64?: string): Promise<{ id: string }> {
  const body = fitBase64 ? { ...activity, fitBase64 } : activity;
  const res = await apiFetch(baseUrl, "/cardio", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) {
    if (res.status === 409) throw new Error("Ya existe una actividad en ese momento");
    throw new Error("No se pudo guardar la actividad");
  }
  return (await res.json()) as { id: string };
}

// Trae UNA actividad de cardio por id.
export async function getCardioById(baseUrl: string, id: string): Promise<CardioActivity> {
  const res = await apiFetch(baseUrl, `/cardio/${id}`);
  if (!res.ok) throw new Error("No se pudo cargar la actividad");
  return (await res.json()) as CardioActivity;
}

// Actualiza parcialmente una actividad (solo campos editables manualmente).
export async function updateCardio(
  baseUrl: string, id: string,
  patch: Partial<Pick<CardioActivity, "type" | "durationMs" | "distanceM" | "notes">>,
): Promise<void> {
  const res = await apiFetch(baseUrl, `/cardio/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (!res.ok) throw new Error("No se pudo actualizar la actividad");
}

// Elimina una actividad de cardio del backend.
export async function deleteCardio(baseUrl: string, id: string): Promise<void> {
  const res = await apiFetch(baseUrl, `/cardio/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("No se pudo borrar la actividad");
}

// Manda el .FIT (base64) a parsear. Devuelve el preview SIN persistir. En error, propaga el
// mensaje del backend (400 con "No parece un archivo .FIT", etc.) para mostrarlo tal cual.
export async function parseFitCardio(baseUrl: string, fitBase64: string): Promise<CardioFitPreview> {
  const res = await apiFetch(baseUrl, "/cardio/parse", { method: "POST", body: JSON.stringify({ fitBase64 }) });
  if (!res.ok) {
    const msg = await res.json().then((b: { error?: string }) => b.error).catch(() => undefined);
    throw new Error(msg || "No se pudo leer el archivo .FIT");
  }
  return (await res.json()) as CardioFitPreview;
}

// Rellena los datos de una actividad releyendo el .FIT guardado en el server. Propaga el mensaje
// del backend (404 "no tiene archivo guardado" / 400 archivo ilegible) para mostrarlo tal cual.
export async function reprocessCardio(baseUrl: string, id: string): Promise<void> {
  const res = await apiFetch(baseUrl, `/cardio/${id}/reprocess`, { method: "POST" });
  if (!res.ok) {
    const msg = await res.json().then((b: { error?: string }) => b.error).catch(() => undefined);
    throw new Error(msg || "No se pudo reprocesar la actividad");
  }
}

export async function reprocessAllCardio(baseUrl: string): Promise<{ reprocesadas: number; sinArchivo: number; fallidas: number }> {
  const res = await apiFetch(baseUrl, "/cardio/reprocess-all", { method: "POST" });
  if (!res.ok) throw new Error("No se pudieron reprocesar las actividades");
  return await res.json();
}
