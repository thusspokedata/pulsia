import { apiFetch, errorMessage } from "./client";
import type {
  Supplement,
  SupplementInput,
  SupplementExtraction,
  PlanView,
  GeneratePlanInput,
  PlanItemPatch,
  PlanItemView,
  TakeInput,
  DayChecklistEntry,
} from "@pulsia/shared";

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

export async function getSupplement(baseUrl: string, id: string): Promise<Supplement> {
  const res = await apiFetch(baseUrl, `/nutrition/supplements/${id}`);
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo cargar el suplemento."));
  return (await res.json()) as Supplement;
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

export async function getPlan(baseUrl: string): Promise<{ plan: PlanView | null; warnings: string[] }> {
  const res = await apiFetch(baseUrl, "/nutrition/supplements/plan");
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo cargar el plan."));
  return (await res.json()) as { plan: PlanView | null; warnings: string[] };
}

export async function generatePlan(baseUrl: string, input: GeneratePlanInput): Promise<{ plan: PlanView; warnings: string[] }> {
  // La generación con IA tarda ~5-15s → timeout amplio.
  const res = await apiFetch(baseUrl, "/nutrition/supplements/plan/generate", {
    method: "POST", body: JSON.stringify(input), timeoutMs: 60000,
  });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo generar el plan."));
  return (await res.json()) as { plan: PlanView; warnings: string[] };
}

export async function updatePlanItem(baseUrl: string, id: string, patch: PlanItemPatch): Promise<PlanItemView> {
  const res = await apiFetch(baseUrl, `/nutrition/supplements/plan/items/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo actualizar el ítem del plan."));
  return (await res.json()) as PlanItemView;
}

export async function getDayChecklist(baseUrl: string, date: string): Promise<{ hasPlan: boolean; entries: DayChecklistEntry[] }> {
  const res = await apiFetch(baseUrl, `/nutrition/supplements/day?date=${date}`);
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo cargar el checklist del día."));
  return (await res.json()) as { hasPlan: boolean; entries: DayChecklistEntry[] };
}

export async function putTake(baseUrl: string, input: TakeInput): Promise<void> {
  const res = await apiFetch(baseUrl, "/nutrition/supplements/takes", { method: "PUT", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo registrar la toma."));
}
