import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import SuplementosScreen from "../app/nutricion/suplementos";
import { listSupplements, explainSupplement, deleteSupplement } from "../src/api/supplements";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: (cb: any) => {
    const { useEffect } = require("react");
    useEffect(() => { cb(); }, []);
  },
}));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));
jest.mock("../src/api/supplements", () => ({
  listSupplements: jest.fn(async () => []),
  explainSupplement: jest.fn(async () => ({})),
  deleteSupplement: jest.fn(async () => {}),
}));

const zma = {
  id: "11111111-1111-4111-8111-111111111111", name: "ZMA Pro", brand: null,
  servingLabel: "2 cápsulas", components: [{ name: "Zinc", amount: 10, unit: "mg" }],
  labelMaxPerDay: null, source: "label",
  info: "El zinc participa en el sistema inmune.", notes: null, createdAt: 0,
};

test("estado vacío: CTA para agregar el primer suplemento", async () => {
  await render(<SuplementosScreen />);
  await waitFor(() => expect(screen.getByText(/Todavía no cargaste suplementos/i)).toBeTruthy());
  expect(screen.getByText(/Agregar por foto/i)).toBeTruthy();
});

test("lista los suplementos; tap expande el detalle con componentes + info", async () => {
  (listSupplements as jest.Mock).mockResolvedValueOnce([zma]);
  await render(<SuplementosScreen />);
  const item = await screen.findByText("ZMA Pro");
  // Detalle colapsado: la info no está visible.
  expect(screen.queryByText(/sistema inmune/)).toBeNull();
  await fireEvent.press(item);
  expect(screen.getByText(/Zinc/)).toBeTruthy();
  expect(screen.getByText(/10 mg/)).toBeTruthy();
  expect(screen.getByText(/sistema inmune/)).toBeTruthy();
});

test("suplemento sin info muestra 'Explicar con IA' y la genera", async () => {
  (listSupplements as jest.Mock).mockResolvedValueOnce([{ ...zma, info: null }]);
  (explainSupplement as jest.Mock).mockResolvedValueOnce({ ...zma, info: "Explicación nueva." });
  await render(<SuplementosScreen />);
  await fireEvent.press(await screen.findByText("ZMA Pro"));
  const btn = screen.getByText(/Explicar con IA/i);
  await fireEvent.press(btn);
  await waitFor(() => expect(screen.getByText("Explicación nueva.")).toBeTruthy());
  expect(explainSupplement).toHaveBeenCalledWith("http://x", zma.id);
});
