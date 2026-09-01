// NUT-15: useSupplementDaily arma el aporte de suplementos por día para foldearlo en la curva
// "Evolución". El punto delicado es el guard por query-key: al cambiar de nutriente/rango, el hook
// NO debe devolver el resultado de la consulta anterior mientras la nueva request está en vuelo
// (si no, la curva combinaría comidas actuales con suplementos viejos). Este test controla el
// momento de resolución de la request (deferred) para cubrir esa ventana.
import { renderHook, act, waitFor } from "@testing-library/react-native";
import type { SupplementNutrients } from "../src/api/supplements";

jest.mock("../src/storage/config", () => ({
  getBackendUrl: jest.fn(async () => "http://x"),
}));

// getRangeNutrientsDaily devuelve una promesa que resolvemos a mano (deferred), para poder
// observar el estado del hook ANTES de que cada request termine.
let resolvers: Array<(v: { perDay: Record<string, SupplementNutrients> }) => void> = [];
const mockDaily = jest.fn(
  (..._args: unknown[]) => new Promise<{ perDay: Record<string, SupplementNutrients> }>((res) => resolvers.push(res)),
);
jest.mock("../src/api/supplements", () => ({
  getRangeNutrientsDaily: (...args: unknown[]) => mockDaily(...args),
}));

import { useSupplementDaily } from "../src/nutrition/useSupplementDaily";

const day = (totals: Record<string, number>): SupplementNutrients => ({ totals, byNutrient: {} });

beforeEach(() => {
  resolvers = [];
  jest.clearAllMocks();
});

test("mapea perDay.totals[nutriente] a un Record por día cuando la request resuelve", async () => {
  const { result } = await renderHook(() => useSupplementDaily(7, 0, "vitamin_d_mcg"));
  await waitFor(() => expect(mockDaily).toHaveBeenCalledTimes(1));
  await act(async () => {
    resolvers[0]({ perDay: { "2026-08-01": day({ vitamin_d_mcg: 50 }), "2026-08-02": day({ vitamin_d_mcg: 30 }) } });
  });
  await waitFor(() => expect(result.current).toEqual({ "2026-08-01": 50, "2026-08-02": 30 }));
});

test("salt_g pide sodium_mg y devuelve el sodio del día (la conversión a sal la hace el fold)", async () => {
  const { result } = await renderHook(() => useSupplementDaily(7, 0, "salt_g"));
  await waitFor(() => expect(mockDaily).toHaveBeenCalledTimes(1));
  await act(async () => {
    resolvers[0]({ perDay: { "2026-08-01": day({ sodium_mg: 300 }) } });
  });
  await waitFor(() => expect(result.current).toEqual({ "2026-08-01": 300 }));
});

test("guard por query-key: al cambiar de nutriente NO devuelve los suplementos de la consulta previa hasta que resuelve la nueva", async () => {
  const { result, rerender } = await renderHook(
    ({ n }: { n: "vitamin_d_mcg" | "sodium_mg" }) => useSupplementDaily(7, 0, n),
    { initialProps: { n: "vitamin_d_mcg" as const } },
  );
  // 1ª consulta (vitamina D) resuelve
  await waitFor(() => expect(mockDaily).toHaveBeenCalledTimes(1));
  await act(async () => {
    resolvers[0]({ perDay: { "2026-08-01": day({ vitamin_d_mcg: 50 }) } });
  });
  await waitFor(() => expect(result.current).toEqual({ "2026-08-01": 50 }));

  // Cambio de nutriente → nueva request en vuelo. ANTES de que resuelva, el hook debe devolver {}
  // (no los datos de vitamina D, que no corresponden a la consulta de sodio).
  await act(async () => { rerender({ n: "sodium_mg" }); });
  expect(result.current).toEqual({});
  await waitFor(() => expect(mockDaily).toHaveBeenCalledTimes(2));

  // Al resolver la 2ª, aparece el dato de la consulta actual.
  await act(async () => {
    resolvers[1]({ perDay: { "2026-08-01": day({ sodium_mg: 300 }) } });
  });
  await waitFor(() => expect(result.current).toEqual({ "2026-08-01": 300 }));
});
