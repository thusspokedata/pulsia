import { useQuery } from "@tanstack/react-query";
import type { NutritionGoalInput } from "@pulsia/shared";
import { apiFetch } from "../api/client";

export function useGoalInput() {
  return useQuery({
    queryKey: ["nutrition-goal"],
    queryFn: () => apiFetch<NutritionGoalInput | null>("/nutrition/goal"),
  });
}
