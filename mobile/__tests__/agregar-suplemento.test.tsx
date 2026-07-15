import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AgregarSuplementoScreen from "../app/nutricion/agregar-suplemento";
import { extractSupplement, createSupplement, updateSupplement, getSupplement } from "../src/api/supplements";

let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => mockParams }));
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
  getSupplement: jest.fn(async () => { throw new Error("no debería llamarse sin id"); }),
}));

beforeEach(() => {
  mockParams = {};
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

test("componente parcialmente cargado NO se descarta en silencio: error y no guarda", async () => {
  await render(<AgregarSuplementoScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText(/Nombre/i), "Creatina");
  await fireEvent.changeText(screen.getByPlaceholderText(/Porción/i), "5 g");
  await fireEvent.changeText(screen.getByPlaceholderText("Componente"), "Creatina monohidrato");
  await fireEvent.changeText(screen.getByPlaceholderText("Cantidad"), "5");
  await fireEvent.changeText(screen.getByPlaceholderText("Unidad"), "g");
  await fireEvent.press(screen.getByText(/\+ Componente/i));
  // segunda fila: solo nombre, sin cantidad ni unidad → incompleta
  await fireEvent.changeText(screen.getByPlaceholderText("Componente 2"), "Taurina");
  await fireEvent.press(screen.getByText(/Guardar/i));
  await waitFor(() => expect(screen.getByText(/componente 2 está incompleto/i)).toBeTruthy());
  expect(createSupplement).not.toHaveBeenCalled();
});

test("una fila extra totalmente vacía se ignora sin error", async () => {
  await render(<AgregarSuplementoScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText(/Nombre/i), "Creatina");
  await fireEvent.changeText(screen.getByPlaceholderText(/Porción/i), "5 g");
  await fireEvent.changeText(screen.getByPlaceholderText("Componente"), "Creatina monohidrato");
  await fireEvent.changeText(screen.getByPlaceholderText("Cantidad"), "5");
  await fireEvent.changeText(screen.getByPlaceholderText("Unidad"), "g");
  await fireEvent.press(screen.getByText(/\+ Componente/i)); // fila vacía extra
  await fireEvent.press(screen.getByText(/Guardar/i));
  await waitFor(() => expect(createSupplement).toHaveBeenCalled());
  const input = (createSupplement as jest.Mock).mock.calls[0][1];
  expect(input.components).toHaveLength(1);
  expect(input.components[0]).toMatchObject({ name: "Creatina monohidrato", amount: 5, unit: "g" });
});

test("editar un componente tras la extracción quita la explicación (quedó obsoleta) también en alta nueva", async () => {
  await render(<AgregarSuplementoScreen />);
  await fireEvent.press(screen.getByText(/Galería/i));
  await waitFor(() => expect(screen.getByDisplayValue("ZMA Pro")).toBeTruthy());
  await fireEvent.changeText(screen.getByPlaceholderText("Cantidad"), "20"); // cambia la composición
  await fireEvent.press(screen.getByText(/Guardar/i));
  await waitFor(() => expect(createSupplement).toHaveBeenCalled());
  const input = (createSupplement as jest.Mock).mock.calls[0][1];
  expect(input.info ?? null).toBeNull(); // la info ya no describe los componentes guardados
});

test("edición: precarga desde getSupplement y guarda con updateSupplement preservando info", async () => {
  mockParams = { id: "id1" };
  (getSupplement as jest.Mock).mockResolvedValueOnce({
    id: "id1", createdAt: 0,
    name: "ZMA Pro", brand: "BrandX", servingLabel: "2 cápsulas",
    components: [{ name: "Zinc", amount: 10, unit: "mg" }],
    labelMaxPerDay: "2 cápsulas al día", source: "label",
    info: "El zinc participa en el sistema inmune.", notes: null,
  });
  await render(<AgregarSuplementoScreen />);
  await waitFor(() => expect(screen.getByDisplayValue("ZMA Pro")).toBeTruthy());
  expect(screen.getByDisplayValue("2 cápsulas")).toBeTruthy();
  expect(screen.getByDisplayValue("Zinc")).toBeTruthy();
  expect(screen.getByDisplayValue("10")).toBeTruthy();
  await fireEvent.press(screen.getByText(/Guardar/i));
  await waitFor(() => expect(updateSupplement).toHaveBeenCalled());
  expect(createSupplement).not.toHaveBeenCalled();
  const [, id, input] = (updateSupplement as jest.Mock).mock.calls[0];
  expect(id).toBe("id1");
  expect(input).toMatchObject({ name: "ZMA Pro", source: "label" });
  expect(input.info).toBe("El zinc participa en el sistema inmune.");
});
