import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCardio } from "./useCardio";

function wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test("pega a /cardio y devuelve las actividades", async () => {
  const activities = [
    { id: "1", type: "run", startedAt: 1000, durationMs: 600000, avgHr: 140, kcal: 300 },
  ];
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => activities });
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useCardio(), { wrapper: wrap });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual(activities);
  expect(fetchMock).toHaveBeenCalledWith("/cardio", expect.objectContaining({ method: "GET" }));
});
