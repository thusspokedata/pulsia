import { apiFetch } from "./client";
import type { EcgRecording } from "@pulsia/shared";

// Sube un PDF de KardiaMobile (base64) para que el backend lo interprete de forma asíncrona.
export async function uploadEcg(baseUrl: string, pdfBase64: string): Promise<{ id: string; status: string }> {
  // La subida lleva el PDF entero en el body: le damos más margen que el timeout por defecto
  // (15s) de apiFetch para que no aborte en conexiones lentas o archivos grandes.
  const res = await apiFetch(baseUrl, "/ecg", { method: "POST", body: JSON.stringify({ pdfBase64 }), timeoutMs: 60000 });
  // Propagamos el motivo real (mensaje del backend / status) en vez de un texto genérico,
  // así la pantalla puede mostrar por qué falló y se puede diagnosticar.
  if (!res.ok) throw new Error(await uploadErrorMessage(res));
  return (await res.json()) as { id: string; status: string };
}

// Traduce la respuesta de error del backend a un mensaje mostrable. El backend devuelve
// { error }: string en los casos accionables (PDF grande/no-PDF/protegido, fallo al guardar)
// o un array de issues de zod en el 400 de validación; si no hay JSON, caemos al status.
async function uploadErrorMessage(res: Response): Promise<string> {
  let backendMsg: string | null = null;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") backendMsg = body.error;
  } catch {
    // Cuerpo no-JSON (p.ej. un 413/502 de un proxy intermedio): nos quedamos con el status.
  }
  if (backendMsg) return backendMsg;
  if (res.status === 413) return "El PDF es demasiado grande para subirlo.";
  return `No se pudo subir el ECG (error ${res.status}). Reintentá.`;
}

// Trae el historial de registros de ECG del usuario.
export async function listEcg(baseUrl: string): Promise<EcgRecording[]> {
  const res = await apiFetch(baseUrl, "/ecg");
  if (!res.ok) throw new Error("No se pudieron cargar los registros de ECG");
  const data = (await res.json()) as { recordings: EcgRecording[] };
  return data.recordings;
}

// Trae UN registro de ECG por id (para ver el estado/análisis).
export async function getEcg(baseUrl: string, id: string): Promise<EcgRecording> {
  const res = await apiFetch(baseUrl, `/ecg/${id}`);
  if (!res.ok) throw new Error("No se pudo cargar el registro de ECG");
  return (await res.json()) as EcgRecording;
}

// Elimina un registro de ECG del backend.
export async function deleteEcg(baseUrl: string, id: string): Promise<void> {
  const res = await apiFetch(baseUrl, `/ecg/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("No se pudo eliminar el registro de ECG");
}

// URL del PDF original (para abrir/descargar); no pasa por apiFetch porque no es JSON.
export function ecgPdfUrl(baseUrl: string, id: string): string {
  return `${baseUrl.replace(/\/$/, "")}/ecg/${id}/pdf`;
}
