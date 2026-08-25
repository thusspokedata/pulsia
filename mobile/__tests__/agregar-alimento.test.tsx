import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import AgregarAlimentoScreen from "../app/nutricion/agregar-alimento";
import {
  assembleUsdaFood, createFood, describeFood, extractFood, getFood, getUsdaEntry, searchUsdaFoods,
  aiMicrosForFood, updateFood,
} from "../src/api/nutrition";
import { useLocalSearchParams } from "expo-router";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));
jest.mock("../src/api/nutrition", () => ({
  extractFood: jest.fn(),
  describeFood: jest.fn(),
  createFood: jest.fn(),
  getFood: jest.fn(),
  updateFood: jest.fn(),
  getUsdaEntry: jest.fn(),
  searchUsdaFoods: jest.fn(),
  assembleUsdaFood: jest.fn(),
  aiMicrosForFood: jest.fn(),
}));

// Los candidatos que el backend devolvió junto con la extracción. El primero es el que eligió la
// IA (`usdaFdcId`); el segundo es la corrección que hace el usuario en los tests del "¿no es este?".
const CANDIDATOS = [
  { fdcId: 170567, description: "Nuts, almonds", dataType: "sr_legacy_food" },
  { fdcId: 170178, description: "Nuts, almond butter, plain, without salt", dataType: "sr_legacy_food" },
];

// La identificación que usó el backend. Es lo que hay que devolverle a `/usda/assemble` para
// re-mezclar: `searchQuery` no existe en `FoodExtraction`, así que sin guardarla no se puede.
const IDENTIFICACION = {
  name: "Almendra", basis: "per_100g", kcal: 579, protein_g: 21, carbs_g: 22, fat_g: 50,
  saturated_fat_g: 3.8, sugars_g: 4.4, fiber_g: 12.5, sodium_mg: 0, cholesterol_mg: 0, water_ml: 4,
  unitWeightG: 1.2, sourceMacros: "ai", searchQuery: "almonds raw",
};

const ALMENDRA = {
  name: "Almendra", basis: "per_100g", kcal: 579, protein_g: 21, carbs_g: 22, fat_g: 50,
  saturated_fat_g: 3.8, sugars_g: 4.4, fiber_g: 12.5, sodium_mg: 0, cholesterol_mg: 0, water_ml: 4,
  unitWeightG: 1.2, sourceMacros: "ai", sourceMicros: "usda", usdaFdcId: 170567,
  // Un micro de USDA que el formulario NO edita: sirve para probar que sobrevive al guardado.
  vitamin_e_mg: 25.6,
  // Metadata de azúcar que el form no edita: la almendra es fruto seco entero → azúcar intrínseco,
  // con 0 g de agregado. Ambos tienen que sobrevivir al guardado (create y update).
  sugarClass: "intrinsic", added_sugars_g: 0,
  candidates: CANDIDATOS, identification: IDENTIFICACION,
};

// Lo que devuelve `/usda/assemble` con el SEGUNDO candidato: otra fila de USDA, otros micros.
// Los macros también cambian porque con `sourceMacros: "ai"` USDA le gana a la estimación.
const MANTECA_ALMENDRA = {
  ...ALMENDRA, kcal: 614, fiber_g: 10.3, usdaFdcId: 170178, vitamin_e_mg: 24.2, calcium_mg: 347,
  candidates: undefined, identification: undefined,
};

beforeEach(() => {
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (describeFood as jest.Mock).mockResolvedValue(ALMENDRA);
  (assembleUsdaFood as jest.Mock).mockResolvedValue(MANTECA_ALMENDRA);
  (searchUsdaFoods as jest.Mock).mockResolvedValue([]);
  (getUsdaEntry as jest.Mock).mockResolvedValue(CANDIDATOS[0]);
  // `clearAllMocks` limpia las llamadas pero NO las implementaciones: sin esto, el mock que pone el
  // test de la foto se filtraría a los que corren después.
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true });
});

// Alta por texto que deja el formulario precargado con el match de USDA.
async function altaConMatch() {
  await render(<AgregarAlimentoScreen />);
  await fireEvent.changeText(screen.getByTestId("food-text-input"), "almendra");
  await fireEvent.press(screen.getByTestId("food-text-submit"));
  await waitFor(() => expect(screen.getByDisplayValue("Almendra")).toBeTruthy());
}

test("escribir el alimento precarga el formulario, sin foto", async () => {
  await render(<AgregarAlimentoScreen />);
  await fireEvent.changeText(screen.getByTestId("food-text-input"), "almendra");
  await fireEvent.press(screen.getByTestId("food-text-submit"));
  await waitFor(() => expect(screen.getByDisplayValue("Almendra")).toBeTruthy());
  expect(screen.getByDisplayValue("579")).toBeTruthy(); // kcal
  expect(describeFood).toHaveBeenCalledWith("http://x", "almendra");
});

// Lo que devuelve "que la IA complete": micros estimados. El nombre/macros vienen en 0/basura a
// propósito — el form NO debe adoptarlos (solo mergea micros).
const AI_MICROS_RESP = {
  name: "NO USAR", basis: "per_100g", kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, unitWeightG: null,
  sourceMacros: "ai", sourceMicros: "ai", usdaFdcId: null,
  saturated_fat_g: 1.1, sugars_g: 2.2, fiber_g: 3.3, sodium_mg: 40, cholesterol_mg: 0, water_ml: 5,
  vitamin_c_mg: 8, vitamin_e_mg: 9,
};

test("'que la IA complete' mergea SOLO los micros y conserva las ediciones del usuario", async () => {
  (aiMicrosForFood as jest.Mock).mockResolvedValue(AI_MICROS_RESP);
  await altaConMatch();
  // El usuario edita nombre y kcal ANTES de tocar el botón: no se deben perder.
  await fireEvent.changeText(screen.getByPlaceholderText("Nombre"), "Mi mezcla");
  await fireEvent.press(screen.getByTestId("ai-completar"));

  // La request se armó con el form ACTUAL (nombre editado), conservando el searchQuery.
  await waitFor(() => expect(aiMicrosForFood).toHaveBeenCalled());
  const idEnviada = (aiMicrosForFood as jest.Mock).mock.calls[0][1];
  expect(idEnviada.name).toBe("Mi mezcla");
  expect(idEnviada.kcal).toBe(579);                 // el macro del form, no el de la IA
  expect(idEnviada.searchQuery).toBe(IDENTIFICACION.searchQuery);

  // El form conserva nombre y macros; solo cambian los micros (y la procedencia pasa a IA).
  await waitFor(() => expect(screen.getByTestId("source-chip-micros-ai")).toBeTruthy());
  expect(screen.getByDisplayValue("Mi mezcla")).toBeTruthy();   // NO "NO USAR"
  expect(screen.getByDisplayValue("579")).toBeTruthy();          // kcal conservada
  expect(screen.getByDisplayValue("3.3")).toBeTruthy();          // fibra mergeada del estimado
  expect(screen.getByTestId("micros-ia-info")).toBeTruthy();     // ya NO dice "sin vitaminas de USDA"
  expect(screen.queryByTestId("source-chip-micros-usda")).toBeNull();
});

test("el botón no hace nada con menos de 2 caracteres", async () => {
  await render(<AgregarAlimentoScreen />);
  await fireEvent.changeText(screen.getByTestId("food-text-input"), "a");
  await fireEvent.press(screen.getByTestId("food-text-submit"));
  expect(describeFood).not.toHaveBeenCalled();
});

test("el formulario precargado muestra de dónde salió el dato", async () => {
  await render(<AgregarAlimentoScreen />);
  await fireEvent.changeText(screen.getByTestId("food-text-input"), "almendra");
  await fireEvent.press(screen.getByTestId("food-text-submit"));
  // "ai" (lo estimó la IA), NO el "manual" con el que arranca el formulario vacío.
  await waitFor(() => expect(screen.getByTestId("source-chip-ai")).toBeTruthy());
  expect(screen.queryByTestId("source-chip-manual")).toBeNull();
  // Y los micros vinieron de USDA: es otra procedencia y se dice aparte.
  expect(screen.getByTestId("source-chip-micros-usda")).toBeTruthy();
});

test("la foto de una etiqueta precarga el formulario y lo marca como dato de etiqueta", async () => {
  // Cubre dos cosas: que prefillFrom propaga el `sourceMacros` del dato, y el camino de la foto,
  // que no tenía ningún test.
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ base64: "ZmFrZQ==", mimeType: "image/jpeg" }],
  });
  (extractFood as jest.Mock).mockResolvedValue({ ...ALMENDRA, name: "Muesli Lidl", sourceMacros: "label" });

  await render(<AgregarAlimentoScreen />);
  await fireEvent.press(screen.getByText(/galer/i));
  await waitFor(() => expect(screen.getByDisplayValue("Muesli Lidl")).toBeTruthy());
  expect(screen.getByTestId("source-chip-label")).toBeTruthy();
});

test("el alta guarda SODIO aunque el campo se cargue en sal", async () => {
  // El usuario ve "Sal (g)" —es lo que dice el envase— pero lo que se persiste es sodio.
  await render(<AgregarAlimentoScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText("Nombre"), "Fiambre");
  for (const [ph, v] of [["Calorías (por 100g)", "100"], ["Proteína (g)", "10"], ["Carbohidratos (g)", "0"], ["Grasa (g)", "5"]] as const) {
    await fireEvent.changeText(screen.getByPlaceholderText(ph), v);
  }
  await fireEvent.changeText(screen.getByPlaceholderText("Sal (g, opcional)"), "2");
  expect(screen.getByText(/Sodio ≈ 800 mg/)).toBeTruthy();

  await fireEvent.press(screen.getByText("Guardar en el catálogo"));
  await waitFor(() => expect(createFood).toHaveBeenCalled());
  const input = (createFood as jest.Mock).mock.calls[0][1];
  expect(input.sodium_mg).toBe(800); // 2 g de sal / 2,5
  expect(input).not.toHaveProperty("salt_g");
  // Alta a mano: no la estimó nadie, y no hay micros de USDA que anunciar.
  expect(input.sourceMacros).toBe("manual");
  expect(input.sourceMicros).toBeNull();
});

// ---- "¿no es este?": corregir a mano la fila de USDA que eligió la IA ----
// La 2ª llamada de IA se equivoca de verdad (para "fried egg" el mejor match por trigramas es
// "Fried eggplant"), así que sin esto los micros quedan mal y no hay forma de arreglarlos.

test("el alta con match dice de qué entrada de USDA salieron los micros", async () => {
  await altaConMatch();
  expect(screen.getByTestId("usda-chip")).toHaveTextContent(/^USDA · Nuts, almonds$/);
});

test("el '¿no es este?' despliega los candidatos, y arrancan ocultos", async () => {
  await altaConMatch();
  // Cerrado por defecto: son 8 filas en inglés y el 90 % de las veces el match está bien.
  expect(screen.queryByTestId("usda-candidato-170178")).toBeNull();
  await fireEvent.press(screen.getByTestId("usda-no-es-este"));
  expect(screen.getByTestId("usda-candidato-170178")).toBeTruthy();
  expect(screen.getByText("Nuts, almond butter, plain, without salt")).toBeTruthy();
});

test("elegir otro candidato re-mezcla con la identificación del alta y recarga el formulario", async () => {
  await altaConMatch();
  await fireEvent.press(screen.getByTestId("usda-no-es-este"));
  await fireEvent.press(screen.getByTestId("usda-candidato-170178"));

  await waitFor(() => expect(assembleUsdaFood).toHaveBeenCalledWith("http://x", IDENTIFICACION, 170178));
  // Los valores VISIBLES cambian: kcal y fibra son de la fila nueva, no de la que eligió la IA.
  await waitFor(() => expect(screen.getByDisplayValue("614")).toBeTruthy());
  expect(screen.getByDisplayValue("10.3")).toBeTruthy();
  // Y el chip nombra la entrada nueva: si siguiera diciendo "Nuts, almonds" el usuario no sabría
  // si su corrección se aplicó.
  expect(screen.getByTestId("usda-chip")).toHaveTextContent(/^USDA · Nuts, almond butter, plain, without salt$/);
});

test("elegir otro candidato y guardar persiste los micros del NUEVO, no los del viejo", async () => {
  // EL BUG DE LA COSTURA. El formulario solo edita 6 micros; los otros 24 viajan de vuelta en
  // `carried` porque el PATCH reemplaza la fila entera. Si al recargar con el resultado de la
  // re-mezcla `carried` no se actualiza, la pantalla muestra la fila nueva y guarda la vieja.
  await altaConMatch();
  await fireEvent.press(screen.getByTestId("usda-no-es-este"));
  await fireEvent.press(screen.getByTestId("usda-candidato-170178"));
  await waitFor(() => expect(screen.getByDisplayValue("614")).toBeTruthy());

  await fireEvent.press(screen.getByText("Guardar en el catálogo"));
  await waitFor(() => expect(createFood).toHaveBeenCalled());
  const input = (createFood as jest.Mock).mock.calls[0][1];
  expect(input.usdaFdcId).toBe(170178);
  expect(input.vitamin_e_mg).toBe(24.2); // la manteca de almendras, NO los 25,6 de la almendra
  expect(input.calcium_mg).toBe(347);
  expect(input.sourceMicros).toBe("usda");
  // Y los micros que el form SÍ edita también son los nuevos.
  expect(input.fiber_g).toBe(10.3);
});

test("el alta round-trippea sugarClass y added_sugars_g del alimento clasificado por IA", async () => {
  // Un alimento clasificado por la IA (aquí, almendra → intrinsic + 0 g agregado): al guardar, la
  // clase y el agregado tienen que viajar en el payload. Sin `sugarClass: sugarClassCargado`, el
  // PATCH del backend haría `?? null` y la clase se PERDERÍA (fruta que vuelve a marcar "azúcar
  // alto"). `added_sugars_g` viaja por `...carried.micros` (micro del registro que el form no edita).
  await altaConMatch();
  await fireEvent.press(screen.getByText("Guardar en el catálogo"));
  await waitFor(() => expect(createFood).toHaveBeenCalled());
  const input = (createFood as jest.Mock).mock.calls[0][1];
  expect(input.sugarClass).toBe("intrinsic");
  expect(input.added_sugars_g).toBe(0);
});

test("editar un alimento ya clasificado guarda su sugarClass, no la borra", async () => {
  // El bug: EDITAR un alimento con clase la borraba, porque el input no la incluía y el backend
  // hace `?? null`. La clase se cargó en prefillFrom desde getFood y tiene que volver en el update.
  (useLocalSearchParams as jest.Mock).mockReturnValue({ foodId: "abc" });
  (getFood as jest.Mock).mockResolvedValue({ ...ALMENDRA, id: "abc", createdAt: 1, sugarClass: "free", added_sugars_g: 3.1, candidates: undefined, identification: undefined });

  await render(<AgregarAlimentoScreen />);
  await waitFor(() => expect(screen.getByDisplayValue("Almendra")).toBeTruthy());
  await fireEvent.press(screen.getByText("Guardar cambios"));
  await waitFor(() => expect(updateFood).toHaveBeenCalled());
  const input = (updateFood as jest.Mock).mock.calls[0][2];
  expect(input.sugarClass).toBe("free");
  expect(input.added_sugars_g).toBe(3.1);
});

test("si el candidato no está en la lista, se busca en USDA y se elige de los resultados", async () => {
  const otro = { fdcId: 173424, description: "Egg, whole, cooked, fried", dataType: "sr_legacy_food" };
  (searchUsdaFoods as jest.Mock).mockResolvedValue([otro]);
  (assembleUsdaFood as jest.Mock).mockResolvedValue({ ...MANTECA_ALMENDRA, kcal: 196, usdaFdcId: 173424 });

  await altaConMatch();
  await fireEvent.press(screen.getByTestId("usda-no-es-este"));
  await fireEvent.changeText(screen.getByTestId("usda-buscar-input"), "fried egg");
  await fireEvent.press(screen.getByTestId("usda-buscar-submit"));

  await waitFor(() => expect(searchUsdaFoods).toHaveBeenCalledWith("http://x", "fried egg"));
  await waitFor(() => expect(screen.getByTestId("usda-resultado-173424")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("usda-resultado-173424"));
  await waitFor(() => expect(assembleUsdaFood).toHaveBeenCalledWith("http://x", IDENTIFICACION, 173424));
  await waitFor(() => expect(screen.getByDisplayValue("196")).toBeTruthy());
});

test("elegir un resultado de la búsqueda limpia la búsqueda", async () => {
  // Al reabrir "¿no es este?", los candidatos ya filtran la entrada vigente; los resultados de la
  // búsqueda no, así que si quedaran, la fila recién elegida seguiría clickeable y dispararía otra
  // re-mezcla que no cambia nada.
  const otro = { fdcId: 173424, description: "Egg, whole, cooked, fried", dataType: "sr_legacy_food" };
  (searchUsdaFoods as jest.Mock).mockResolvedValue([otro]);
  (assembleUsdaFood as jest.Mock).mockResolvedValue({ ...MANTECA_ALMENDRA, kcal: 196, usdaFdcId: 173424 });

  await altaConMatch();
  await fireEvent.press(screen.getByTestId("usda-no-es-este"));
  await fireEvent.changeText(screen.getByTestId("usda-buscar-input"), "fried egg");
  await fireEvent.press(screen.getByTestId("usda-buscar-submit"));
  await waitFor(() => expect(screen.getByTestId("usda-resultado-173424")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("usda-resultado-173424"));
  await waitFor(() => expect(screen.getByDisplayValue("196")).toBeTruthy());

  await fireEvent.press(screen.getByTestId("usda-no-es-este"));
  expect(screen.queryByTestId("usda-resultado-173424")).toBeNull();
  expect(screen.getByTestId("usda-buscar-input")).toHaveDisplayValue("");
});

test("si la re-mezcla falla, lo dice y no deja el formulario mostrando otra cosa", async () => {
  (assembleUsdaFood as jest.Mock).mockRejectedValue(new Error("No se pudo usar esa entrada de USDA."));
  await altaConMatch();
  await fireEvent.press(screen.getByTestId("usda-no-es-este"));
  await fireEvent.press(screen.getByTestId("usda-candidato-170178"));

  await waitFor(() => expect(screen.getByText("No se pudo usar esa entrada de USDA.")).toBeTruthy());
  // El formulario sigue con lo que había, y el chip con la entrada que sigue vigente.
  expect(screen.getByDisplayValue("579")).toBeTruthy();
  expect(screen.getByTestId("usda-chip")).toHaveTextContent(/^USDA · Nuts, almonds$/);
});

test("en modo edición se ve el chip de USDA pero NO se ofrece corregir el match", async () => {
  // El alimento persistido no guarda `searchQuery`, así que no hay identificación con la que
  // re-mezclar. Ofrecer el "¿no es este?" acá daría un botón que no puede funcionar.
  (useLocalSearchParams as jest.Mock).mockReturnValue({ foodId: "abc" });
  (getFood as jest.Mock).mockResolvedValue({ ...ALMENDRA, id: "abc", createdAt: 1, candidates: undefined, identification: undefined });

  await render(<AgregarAlimentoScreen />);
  await waitFor(() => expect(screen.getByDisplayValue("Almendra")).toBeTruthy());
  expect(getUsdaEntry).toHaveBeenCalledWith("http://x", 170567);
  await waitFor(() => expect(screen.getByTestId("usda-chip")).toHaveTextContent(/^USDA · Nuts, almonds$/));
  expect(screen.queryByTestId("usda-no-es-este")).toBeNull();
});

test("un alta a mano no muestra nada de USDA", async () => {
  await render(<AgregarAlimentoScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText("Nombre"), "Fiambre");
  expect(screen.queryByTestId("usda-chip")).toBeNull();
  expect(screen.queryByTestId("usda-no-es-este")).toBeNull();
});

test("si la IA falla, lo dice y no rompe el formulario", async () => {
  (describeFood as jest.Mock).mockRejectedValue(new Error("No se pudo analizar el alimento."));
  await render(<AgregarAlimentoScreen />);
  await fireEvent.changeText(screen.getByTestId("food-text-input"), "almendra");
  await fireEvent.press(screen.getByTestId("food-text-submit"));
  await waitFor(() => expect(screen.getByText("No se pudo analizar el alimento.")).toBeTruthy());
  expect(screen.getByTestId("food-text-input")).toBeTruthy();
});
