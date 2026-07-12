import { apiFetch } from "./client";
import type { EcgRecording } from "@pulsia/shared";

// Sube un PDF de KardiaMobile (base64) para que el backend lo interprete de forma asíncrona.
export async function uploadEcg(baseUrl: string, pdfBase64: string): Promise<{ id: string; status: string }> {
  const res = await apiFetch(baseUrl, "/ecg", { method: "POST", body: JSON.stringify({ pdfBase64 }) });
  if (!res.ok) throw new Error("No se pudo subir el ECG");
  return (await res.json()) as { id: string; status: string };
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
