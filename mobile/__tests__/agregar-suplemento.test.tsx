import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AgregarSuplementoScreen from "../app/nutricion/agregar-suplemento";
import { extractSupplement, createSupplement } from "../src/api/supplements";

jest.mock("expo-router", () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: false, assets: [{ base64: "AAAA", mimeType: "image/jpeg" }] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ base64: "AAAA", mimeType: "image/jpeg" }] })),
}));
jest.mock("../src/api/supplements", () => ({
  extractSupplement: jest.fn(async () => ({
    name: "ZMA Pro", brand: "BrandX", servingLabel: "2 cápsulas",
    components: [{ name: "Zinc", amount: 10, unit: "mg" }],
    labelMaxPerDay: "2 cápsulas al día", source: "label", info: "El zinc participa en el sistema inmune.",
  })),
  createSupplement: jest.fn(async (u: string, input: any) => ({ ...input, id: "id1", createdAt: 0 })),
  updateSupplement: jest.fn(async () => ({})),
  listSupplements: jest.fn(async () => []),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (extractSupplement as jest.Mock).mockImplementation(async () => ({
    name: "ZMA Pro", brand: "BrandX", servingLabel: "2 cápsulas",
    components: [{ name: "Zinc", amount: 10, unit: "mg" }],
    labelMaxPerDay: "2 cápsulas al día", source: "label", info: "El zinc participa en el sistema inmune.",
  }));
  (createSupplement as jest.Mock).mockImplementation(async (u: string, input: any) => ({ ...input, id: "id1", createdAt: 0 }));
});

test("foto → extracción → form precargado → guardar manda el input completo", async () => {
  await render(<AgregarSuplementoScreen />);
  await fireEvent.press(screen.getByText(/Galería/i));
  await waitFor(() => expect(screen.getByDisplayValue("ZMA Pro")).toBeTruthy());
  expect(screen.getByDisplayValue("2 cápsulas")).toBeTruthy();
  expect(screen.getByDisplayValue("Zinc")).toBeTruthy();
  await fireEvent.press(screen.getByText(/Guardar/i));
  await waitFor(() => expect(createSupplement).toHaveBeenCalled());
  const input = (createSupplement as jest.Mock).mock.calls[0][1];
  expect(input).toMatchObject({ name: "ZMA Pro", source: "label" });
  expect(input.info).toContain("zinc");
});

test("alta manual: form vacío, agregar componente, guardar con source estimate", async () => {
  await render(<AgregarSuplementoScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText(/Nombre/i), "Creatina");
  await fireEvent.changeText(screen.getByPlaceholderText(/Porción/i), "5 g");
  await fireEvent.changeText(screen.getByPlaceholderText(/Componente/i), "Creatina monohidrato");
  await fireEvent.changeText(screen.getByPlaceholderText(/Cantidad/i), "5");
  await fireEvent.changeText(screen.getByPlaceholderText(/Unidad/i), "g");
  await fireEvent.press(screen.getByText(/Guardar/i));
  await waitFor(() => expect(createSupplement).toHaveBeenCalled());
  const input = (createSupplement as jest.Mock).mock.calls[0][1];
  expect(input).toMatchObject({ name: "Creatina", source: "estimate" });
  expect(input.components[0]).toMatchObject({ name: "Creatina monohidrato", amount: 5, unit: "g" });
});

test("si la extracción falla muestra el error y deja el camino manual", async () => {
  (extractSupplement as jest.Mock).mockRejectedValueOnce(new Error("No se pudo analizar la foto."));
  await render(<AgregarSuplementoScreen />);
  await fireEvent.press(screen.getByText(/Galería/i));
  await waitFor(() => expect(screen.getByText(/No se pudo analizar la foto/)).toBeTruthy());
  expect(screen.getByPlaceholderText(/Nombre/i)).toBeTruthy(); // el form sigue usable
});
