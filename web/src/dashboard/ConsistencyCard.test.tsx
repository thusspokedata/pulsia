import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConsistencyCard } from "./ConsistencyCard";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

test("por defecto selecciona el año más reciente CON datos, no el año actual", async () => {
  // No hay sesiones en el año actual del sistema; solo en 2024. El selector debe arrancar en 2024.
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => [
      { id: "1", startedAt: new Date(2024, 2, 10).getTime(), totalDurationMs: 1000, completionPct: 100 },
    ],
  }));
  render(wrap(<ConsistencyCard />));
  await waitFor(() => expect(screen.getByLabelText("Año")).toBeInTheDocument());
  // La grilla debe cubrir el año 2024 (donde hay datos), no el año actual del sistema (vacío).
  await waitFor(() => expect(screen.getByTitle("2024-03-10: 1")).toBeInTheDocument());
});
