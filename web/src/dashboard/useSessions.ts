import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

export interface SessionRow {
  id: string; startedAt: number; totalDurationMs: number | null; completionPct: number | null;
  avgHr: number | null;
}

// GET /sessions no filtra por rango (es liviano); el filtrado por fecha/año lo hace el consumidor.
export function useSessions() {
  return useQuery({ queryKey: ["sessions"], queryFn: () => apiFetch<SessionRow[]>("/sessions") });
}
