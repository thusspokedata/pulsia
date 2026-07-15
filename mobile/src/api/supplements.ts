import { apiFetch } from "./client";
import type { Supplement, SupplementInput, SupplementExtraction } from "@pulsia/shared";

export async function extractSupplement(baseUrl: string, imageBase64: string, mediaType: string): Promise<SupplementExtraction> {
  // La imagen va entera en el body → margen mayor al timeout por defecto.
  const res = await apiFetch(baseUrl, "/nutrition/supplements/extract", {
    method: "POST", body: JSON.stringify({ imageBase64, mediaType }), timeoutMs: 60000,
  });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo analizar la foto."));
  return (await res.json()) as SupplementExtraction;
}

export async function createSupplement(baseUrl: string, input: SupplementInput): Promise<Supplement> {
  const res = await apiFetch(baseUrl, "/nutrition/supplements", { method: "POST", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo guardar el suplemento."));
  return (await res.json()) as Supplement;
}

export async function listSupplements(baseUrl: string): Promise<Supplement[]> {
  const res = await apiFetch(baseUrl, "/nutrition/supplements");
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo cargar el catálogo."));
  return (await res.json()) as Supplement[];
}

export async function updateSupplement(baseUrl: string, id: string, input: SupplementInput): Promise<Supplement> {
  const res = await apiFetch(baseUrl, `/nutrition/supplements/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo actualizar el suplemento."));
  return (await res.json()) as Supplement;
}

export async function deleteSupplement(baseUrl: string, id: string): Promise<void> {
  const res = await apiFetch(baseUrl, `/nutrition/supplements/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo borrar el suplemento."));
}

export async function explainSupplement(baseUrl: string, id: string): Promise<Supplement> {
  // La generación tarda unos segundos → timeout amplio.
  const res = await apiFetch(baseUrl, `/nutrition/supplements/${id}/explain`, { method: "POST", timeoutMs: 60000 });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo generar la explicación."));
  return (await res.json()) as Supplement;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch { /* no-JSON */ }
  return `${fallback} (error ${res.status})`;
}
