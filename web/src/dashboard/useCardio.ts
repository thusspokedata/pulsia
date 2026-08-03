import { useQuery } from "@tanstack/react-query";
import type { CardioActivity } from "@pulsia/shared";
import { apiFetch } from "../api/client";

// GET /cardio sin rango devuelve todas las actividades del usuario; el filtrado por año lo
// hace el consumidor (igual que useSessions). CardioActivity ya trae type/startedAt/durationMs/
// avgHr/kcal — el shape que buildDailyBurn espera para las actividades.
export function useCardio() {
  return useQuery({ queryKey: ["cardio"], queryFn: () => apiFetch<CardioActivity[]>("/cardio") });
}
