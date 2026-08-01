import { useQuery } from "@tanstack/react-query";
import type { TrainingProfile } from "@pulsia/shared";
import { apiFetch, ApiError } from "../api/client";

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      try {
        return await apiFetch<TrainingProfile>("/profile");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
}
