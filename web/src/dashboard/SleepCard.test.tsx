import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DateRangeProvider } from "./DateRangeContext";
import { SleepCard } from "./SleepCard";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}><DateRangeProvider>{ui}</DateRangeProvider></QueryClientProvider>;
}

test("pide sleep_hours y muestra el título", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }));
  render(wrap(<SleepCard />));
  await waitFor(() => expect(screen.getByRole("heading", { name: /sueño/i })).toBeInTheDocument());
  const url = (globalThis.fetch as any).mock.calls[0][0] as string;
  expect(url).toContain("type=sleep_hours");
});
