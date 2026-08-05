import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLatestMetrics } from "./useLatestMetrics";

function wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test("pega a /metrics/latest y devuelve el mapa de últimas métricas", async () => {
  const metrics = { weight_kg: { value: 80, measuredAt: 123 } };
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => metrics });
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useLatestMetrics(), { wrapper: wrap });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual(metrics);
  expect(fetchMock).toHaveBeenCalledWith("/metrics/latest", expect.objectContaining({ method: "GET" }));
});
