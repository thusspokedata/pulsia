import { apiFetch, errorMessage } from "./client";
import type { Report, ReportListItem, ReportGenerateInput } from "@pulsia/shared";

export async function generateReport(baseUrl: string, input: ReportGenerateInput): Promise<Report> {
  const res = await apiFetch(baseUrl, "/nutrition/reports/generate", { method: "POST", body: JSON.stringify(input), timeoutMs: 120000 });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo generar el informe."));
  return (await res.json()) as Report;
}

export async function listReports(baseUrl: string, kind: string, from: number, to: number): Promise<ReportListItem[]> {
  const res = await apiFetch(baseUrl, `/nutrition/reports?kind=${kind}&from=${from}&to=${to}`);
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudieron cargar los informes."));
  return (await res.json()) as ReportListItem[];
}

export async function getReport(baseUrl: string, kind: string, periodStart: number): Promise<Report | null> {
  const res = await apiFetch(baseUrl, `/nutrition/reports/${kind}/${periodStart}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo cargar el informe."));
  return (await res.json()) as Report;
}
