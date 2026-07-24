import { apiFetch, errorMessage } from "./client";
import type {
  Food,
  FoodInput,
  FoodExtraction,
  FoodIdentification,
  Meal,
  MealInput,
  NutritionGoalInput,
  WaterLog,
  WaterLogInput,
} from "@pulsia/shared";

/**
 * Lo que devuelven `extract` y `describe`: la extracción que prefillea el formulario MÁS lo que
 * hace posible el "¿no es este?".
 *
 * `candidates` son las filas de USDA que matchearon (hasta 8, rankeadas; vacío si no hubo match) y
 * `identification` es la identificación que usó el backend — la que hay que devolverle a
 * `/usda/assemble` para re-mezclar con otra fila. Viaja porque `searchQuery` NO es un campo de
 * `FoodExtraction`: sin ella el formulario recibiría los candidatos y no podría elegir ninguno.
 */
export interface FoodExtractionResponse extends FoodExtraction {
  candidates: UsdaEntry[];
  identification: FoodIdentification;
}

export async function extractFood(baseUrl: string, imageBase64: string, mediaType: string): Promise<FoodExtractionResponse> {
  // La imagen va entera en el body → margen mayor al timeout por defecto (15s).
  const res = await apiFetch(baseUrl, "/nutrition/foods/extract", {
    method: "POST", body: JSON.stringify({ imageBase64, mediaType }), timeoutMs: 60000,
  });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo analizar la foto."));
  return (await res.json()) as FoodExtractionResponse;
}

export async function describeFood(baseUrl: string, text: string): Promise<FoodExtractionResponse> {
  // El timeout largo no es por el payload (son 2 palabras) sino por el modelo: el default de 15s
  // no alcanza para una respuesta de Opus.
  const res = await apiFetch(baseUrl, "/nutrition/foods/describe", {
    method: "POST", body: JSON.stringify({ text }), timeoutMs: 60000,
  });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo analizar el alimento."));
  return (await res.json()) as FoodExtractionResponse;
}

export async function createFood(baseUrl: string, input: FoodInput): Promise<Food> {
  const res = await apiFetch(baseUrl, "/nutrition/foods", { method: "POST", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo guardar el alimento."));
  return (await res.json()) as Food;
}

export async function listFoods(baseUrl: string): Promise<Food[]> {
  const res = await apiFetch(baseUrl, "/nutrition/foods");
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo cargar el catálogo."));
  return (await res.json()) as Food[];
}

export async function getFood(baseUrl: string, id: string): Promise<Food> {
  const res = await apiFetch(baseUrl, `/nutrition/foods/${id}`);
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo cargar el alimento."));
  return (await res.json()) as Food;
}

/**
 * Identidad de una fila de la copia local de USDA — SIN sus 34 nutrientes: quien quiera los
 * valores está eligiendo otra fila, y para eso está `/nutrition/usda/assemble`.
 */
export interface UsdaEntry {
  fdcId: number;
  description: string;
  dataType: string;
}

/**
 * Resuelve un `usdaFdcId` a la descripción de esa entrada.
 *
 * El alimento persiste SOLO el id: la descripción vive en la tabla `usda_food` del backend, que
 * es un catálogo compartido y no viaja con el alimento del usuario. Se pide aparte porque las
 * únicas pantallas que la muestran miran un alimento por vez.
 */
export async function getUsdaEntry(baseUrl: string, fdcId: number): Promise<UsdaEntry> {
  const res = await apiFetch(baseUrl, `/nutrition/usda/${fdcId}`);
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo cargar la entrada de USDA."));
  return (await res.json()) as UsdaEntry;
}

/**
 * Búsqueda manual en la copia local de USDA, para cuando el candidato correcto no está entre los
 * 8 que trajo el alta ("¿no es este?" → "no está el que busco").
 *
 * Devuelve identidades, no valores: elegir uno pasa por `assembleUsdaFood`.
 */
export async function searchUsdaFoods(baseUrl: string, q: string): Promise<UsdaEntry[]> {
  // `encodeURIComponent` y no interpolar crudo: los términos son frases en inglés con espacios
  // ("fried egg"), y sin escapar el backend recibe otra cosa que la que el usuario escribió.
  const res = await apiFetch(baseUrl, `/nutrition/usda/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo buscar en USDA."));
  return (await res.json()) as UsdaEntry[];
}

/**
 * Re-mezcla: la misma identificación del alta, pero con la fila de USDA que eligió el usuario.
 *
 * No persiste nada — devuelve la extracción para que el formulario recargue sus valores. Un
 * `fdcId` inexistente da 404 y ACÁ SE LANZA: el backend no degrada a "sin micros" a propósito
 * (el usuario pidió ESA fila), y tragarse el error dejaría el formulario mostrando el alimento
 * anterior como si la elección hubiera funcionado.
 */
export async function assembleUsdaFood(
  baseUrl: string,
  identification: FoodIdentification,
  fdcId: number,
): Promise<FoodExtraction> {
  const res = await apiFetch(baseUrl, "/nutrition/usda/assemble", {
    method: "POST", body: JSON.stringify({ identification, fdcId }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo usar esa entrada de USDA."));
  return (await res.json()) as FoodExtraction;
}

export async function updateFood(baseUrl: string, id: string, input: FoodInput): Promise<Food> {
  const res = await apiFetch(baseUrl, `/nutrition/foods/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo actualizar el alimento."));
  return (await res.json()) as Food;
}

export async function deleteFood(baseUrl: string, id: string): Promise<void> {
  const res = await apiFetch(baseUrl, `/nutrition/foods/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo borrar el alimento."));
}

export async function createMeal(baseUrl: string, input: MealInput): Promise<Meal> {
  const res = await apiFetch(baseUrl, "/nutrition/meals", { method: "POST", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo guardar la comida."));
  return (await res.json()) as Meal;
}

export async function listMeals(baseUrl: string, from: number, to: number): Promise<Meal[]> {
  const res = await apiFetch(baseUrl, `/nutrition/meals?from=${from}&to=${to}`);
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudieron cargar las comidas."));
  return (await res.json()) as Meal[];
}

export async function getMeal(baseUrl: string, id: string): Promise<Meal> {
  const res = await apiFetch(baseUrl, `/nutrition/meals/${id}`);
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo cargar la comida."));
  return (await res.json()) as Meal;
}

export async function updateMeal(baseUrl: string, id: string, input: MealInput): Promise<Meal> {
  const res = await apiFetch(baseUrl, `/nutrition/meals/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo actualizar la comida."));
  return (await res.json()) as Meal;
}

export async function deleteMeal(baseUrl: string, id: string): Promise<void> {
  const res = await apiFetch(baseUrl, `/nutrition/meals/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo borrar la comida."));
}

export async function logWater(baseUrl: string, input: WaterLogInput): Promise<WaterLog> {
  const res = await apiFetch(baseUrl, "/nutrition/water", { method: "POST", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo registrar el agua."));
  return (await res.json()) as WaterLog;
}

export async function listWater(baseUrl: string, from: number, to: number): Promise<WaterLog[]> {
  const res = await apiFetch(baseUrl, `/nutrition/water?from=${from}&to=${to}`);
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo cargar el agua."));
  return (await res.json()) as WaterLog[];
}

export async function deleteWater(baseUrl: string, id: string): Promise<void> {
  const res = await apiFetch(baseUrl, `/nutrition/water/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo borrar el registro de agua."));
}

export async function getNutritionGoal(baseUrl: string): Promise<NutritionGoalInput> {
  const res = await apiFetch(baseUrl, "/nutrition/goal");
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo cargar el objetivo."));
  return (await res.json()) as NutritionGoalInput;
}

export async function putNutritionGoal(baseUrl: string, input: NutritionGoalInput): Promise<NutritionGoalInput> {
  const res = await apiFetch(baseUrl, "/nutrition/goal", { method: "PUT", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo guardar el objetivo."));
  return (await res.json()) as NutritionGoalInput;
}
