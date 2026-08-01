import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DateRangeProvider } from "../dashboard/DateRangeContext";
import { MicrosCard } from "./MicrosCard";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}><DateRangeProvider>{ui}</DateRangeProvider></QueryClientProvider>;
}

test("muestra el colesterol como límite y una fila de cobertura", async () => {
  const item = { id: "i1", foodId: null, foodName: "x", quantity: 1, quantityUnit: "unit", grams: 100, kcal: 200, protein_g: 10, carbs_g: 5, fat_g: 8, cholesterol_mg: 150, iron_mg: 12 };
  const meals = [{ id: "m1", eatenAt: Date.UTC(2026, 6, 10, 12), mealType: null, note: null, items: [item] }];
  vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
    if (url.includes("/nutrition/meals")) return Promise.resolve({ ok: true, status: 200, json: async () => meals });
    if (url.includes("/profile")) return Promise.resolve({ ok: true, status: 200, json: async () => ({ sex: "male", age: 30, daysPerWeek: 3, sessionMinutes: 60 }) });
    return Promise.resolve({ ok: true, status: 200, json: async () => null });
  }));
  render(wrap(<MicrosCard />));
  await waitFor(() => expect(screen.getByText(/colesterol/i)).toBeInTheDocument());
  expect(screen.getByText(/\/ 300 mg/i)).toBeInTheDocument();
});
