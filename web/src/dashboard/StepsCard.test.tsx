import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DateRangeProvider } from "./DateRangeContext";
import { StepsCard } from "./StepsCard";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}><DateRangeProvider>{ui}</DateRangeProvider></QueryClientProvider>;
}

test("muestra el promedio de pasos del rango", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => [
      { id: "1", metricType: "steps", value: 8000, measuredAt: 1000 },
      { id: "2", metricType: "steps", value: 12000, measuredAt: 2000 },
    ],
  }));
  render(wrap(<StepsCard />));
  await waitFor(() => expect(screen.getByText(/promedio: 10\.000/i)).toBeInTheDocument());
});
