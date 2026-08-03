import { and, asc, eq, gte, lte, inArray } from "drizzle-orm";
import { food, meal, mealItem, waterLog, nutritionGoal } from "../db/schema";
import { foodMacrosForQuantity } from "@pulsia/shared";
import { nutrientsFromRow, nutrientsToColumns } from "./columns";
import type { Food, FoodInput, Meal, MealItem, MealItemInput, MealInput, NutritionGoalInput, QuantityUnit, WaterLog, WaterLogInput } from "@pulsia/shared";
import type { Db, DbOrTx } from "../db/client";

type FoodRow = typeof food.$inferSelect;
type MealRow = typeof meal.$inferSelect;
type MealItemRow = typeof mealItem.$inferSelect;

// Errores esperados por input del cliente (foodId ajeno/inexistente, unidad/base incoherente) → 409, no 500.
export class MealValidationError extends Error {}

export function toFood(row: FoodRow): Food {
  return {
    id: row.id, name: row.name, basis: row.basis as Food["basis"],
    kcal: row.kcal, protein_g: row.proteinG, carbs_g: row.carbsG, fat_g: row.fatG,
    unitWeightG: row.unitWeightG,
    // Los 30 nutrientes salen del registro, no de una lista escrita a mano: olvidarse uno acá
    // lo dejaría fuera de la respuesta de la API aunque estuviera guardado en la base.
    ...nutrientsFromRow(row),
    sourceMacros: row.sourceMacros as Food["sourceMacros"],
    sourceMicros: row.sourceMicros as Food["sourceMicros"],
    usdaFdcId: row.usdaFdcId ?? null,
    createdAt: new Date(row.createdAt).getTime(),
  };
}

export function toMeal(row: MealRow, items: MealItemRow[]): Meal {
  return {
    id: row.id, eatenAt: row.eatenAt, mealType: (row.mealType as Meal["mealType"]) ?? null, note: row.note ?? null,
    items: items.map((it): MealItem => ({
      id: it.id, foodId: it.foodId ?? null, foodName: it.foodName,
      quantity: it.quantity, quantityUnit: it.quantityUnit as QuantityUnit, grams: it.grams,
      kcal: it.kcal, protein_g: it.proteinG, carbs_g: it.carbsG, fat_g: it.fatG,
      ...nutrientsFromRow(it),
    })),
  };
}

// Puro: calcula el snapshot de cada ítem desde el catálogo (Map foodId → fila). Tira si falta un food.
export function snapshotItems(items: MealItemInput[], catalog: Map<string, FoodRow>) {
  return items.map((it) => {
    const f = catalog.get(it.foodId);
    if (!f) throw new MealValidationError(`Alimento no encontrado en el catálogo: ${it.foodId}`);
    let m: ReturnType<typeof foodMacrosForQuantity>;
    try {
      m = foodMacrosForQuantity(
        {
          basis: f.basis as Food["basis"], kcal: f.kcal, protein_g: f.proteinG, carbs_g: f.carbsG, fat_g: f.fatG,
          unitWeightG: f.unitWeightG,
          ...nutrientsFromRow(f),
        },
        it.quantity, it.quantityUnit,
      );
    } catch (e) {
      throw new MealValidationError((e as Error).message);
    }
    return {
      foodId: f.id, foodName: f.name, quantity: it.quantity, quantityUnit: it.quantityUnit,
      grams: m.grams, kcal: m.kcal, proteinG: m.protein_g, carbsG: m.carbs_g, fatG: m.fat_g,
      ...nutrientsToColumns(m),
    };
  });
}

// ---- Foods ----
export async function insertFood(db: Db, userId: string, input: FoodInput): Promise<Food> {
  const [row] = await db.insert(food).values({
    userId, name: input.name, basis: input.basis, kcal: input.kcal,
    proteinG: input.protein_g, carbsG: input.carbs_g, fatG: input.fat_g,
    unitWeightG: input.unitWeightG,
    sourceMacros: input.sourceMacros, sourceMicros: input.sourceMicros ?? null,
    usdaFdcId: input.usdaFdcId ?? null,
    ...nutrientsToColumns(input),
  }).returning();
  return toFood(row);
}

export async function listFoods(db: Db, userId: string): Promise<Food[]> {
  // Catálogo COMPARTIDO: se devuelven los alimentos de TODOS. `userId` solo marca cuáles son del
  // que consulta (editar/borrar es del creador). Ver docs/superpowers/specs/2026-08-03-catalogo-comidas-compartido-design.md
  const rows = await db.select().from(food).orderBy(asc(food.name));
  return rows.map((r) => ({ ...toFood(r), mine: r.userId === userId }));
}

export async function getFood(db: Db, userId: string, id: string): Promise<Food | null> {
  const row = await db.query.food.findFirst({ where: and(eq(food.id, id), eq(food.userId, userId)) });
  return row ? toFood(row) : null;
}

// Lectura compartida por id: cualquiera puede leer cualquier alimento. `viewerId` solo calcula `mine`.
export async function getFoodShared(db: Db, id: string, viewerId: string): Promise<Food | null> {
  const row = await db.query.food.findFirst({ where: eq(food.id, id) });
  return row ? { ...toFood(row), mine: row.userId === viewerId } : null;
}

// Solo el creador: distingue 404 (no existe) de 403 (no es tuyo) en las rutas de mutación.
export async function getFoodOwner(db: Db, id: string): Promise<{ userId: string } | null> {
  const row = await db.query.food.findFirst({ where: eq(food.id, id), columns: { userId: true } });
  return row ? { userId: row.userId } : null;
}

export async function updateFood(db: Db, userId: string, id: string, input: FoodInput): Promise<Food | null> {
  const row = await updateFoodRow(db, userId, id, input);
  return row ? toFood(row) : null;
}

// Igual que `updateFood` pero devuelve la fila cruda: el refresh de USDA necesita las columnas
// drizzle para pasárselas a `snapshotItems`, no la forma de dominio.
export async function updateFoodRow(db: DbOrTx, userId: string, id: string, input: FoodInput): Promise<FoodRow | null> {
  const rows = await db.update(food).set({
    name: input.name, basis: input.basis, kcal: input.kcal,
    proteinG: input.protein_g, carbsG: input.carbs_g, fatG: input.fat_g,
    unitWeightG: input.unitWeightG,
    sourceMacros: input.sourceMacros, sourceMicros: input.sourceMicros ?? null,
    usdaFdcId: input.usdaFdcId ?? null,
    ...nutrientsToColumns(input),
  }).where(and(eq(food.id, id), eq(food.userId, userId))).returning();
  return rows[0] ?? null;
}

export async function deleteFood(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db.delete(food).where(and(eq(food.id, id), eq(food.userId, userId))).returning({ id: food.id });
  return rows.length > 0;
}

// ---- Meals ----
export async function createMeal(db: Db, userId: string, input: MealInput): Promise<Meal> {
  const ids = [...new Set(input.items.map((i) => i.foodId))];
  // Catálogo COMPARTIDO: podés registrar tu comida usando un alimento de cualquiera. El aislamiento
  // de diarios lo da que la `meal` se inserta con `userId`, no este lookup.
  const foods = await db.select().from(food).where(inArray(food.id, ids));
  const catalog = new Map(foods.map((f) => [f.id, f]));
  const snapped = snapshotItems(input.items, catalog); // tira MealValidationError si algún foodId no está en el catálogo compartido
  return db.transaction(async (tx) => {
    const [mealRow] = await tx.insert(meal).values({
      userId, eatenAt: input.eatenAt, mealType: input.mealType ?? null, note: input.note ?? null,
    }).returning();
    const itemRows = snapped.length
      ? await tx.insert(mealItem).values(snapped.map((s) => ({ ...s, mealId: mealRow.id }))).returning()
      : [];
    return toMeal(mealRow, itemRows);
  });
}

export async function listMeals(db: Db, userId: string, from?: number, to?: number): Promise<Meal[]> {
  const conds = [eq(meal.userId, userId)];
  if (from != null) conds.push(gte(meal.eatenAt, from));
  if (to != null) conds.push(lte(meal.eatenAt, to));
  const mealRows = await db.select().from(meal).where(and(...conds)).orderBy(asc(meal.eatenAt));
  if (mealRows.length === 0) return [];
  const items = await db.select().from(mealItem).where(inArray(mealItem.mealId, mealRows.map((m) => m.id)));
  const byMeal = new Map<string, MealItemRow[]>();
  for (const it of items) (byMeal.get(it.mealId) ?? byMeal.set(it.mealId, []).get(it.mealId)!).push(it);
  return mealRows.map((m) => toMeal(m, byMeal.get(m.id) ?? []));
}

export async function getMealOwner(db: Db, id: string): Promise<{ userId: string } | null> {
  const row = await db.query.meal.findFirst({ where: eq(meal.id, id), columns: { userId: true } });
  return row ?? null;
}

export async function getMealById(db: Db, userId: string, id: string): Promise<Meal | null> {
  const row = await db.query.meal.findFirst({ where: and(eq(meal.id, id), eq(meal.userId, userId)) });
  if (!row) return null;
  const items = await db.select().from(mealItem).where(eq(mealItem.mealId, id));
  return toMeal(row, items);
}

export async function updateMeal(db: Db, userId: string, id: string, input: MealInput): Promise<Meal | null> {
  const owner = await getMealOwner(db, id);
  if (!owner || owner.userId !== userId) return null;
  const ids = [...new Set(input.items.map((i) => i.foodId))];
  // Catálogo COMPARTIDO: igual que en createMeal, el lookup no filtra por usuario. La propiedad de la
  // comida ya la chequeó `getMealOwner` arriba.
  const foods = await db.select().from(food).where(inArray(food.id, ids));
  const snapped = snapshotItems(input.items, new Map(foods.map((f) => [f.id, f])));
  await db.transaction(async (tx) => {
    await tx.update(meal).set({ eatenAt: input.eatenAt, mealType: input.mealType ?? null, note: input.note ?? null })
      .where(eq(meal.id, id));
    await tx.delete(mealItem).where(eq(mealItem.mealId, id));
    if (snapped.length) await tx.insert(mealItem).values(snapped.map((s) => ({ ...s, mealId: id })));
  });
  const [row] = await db.select().from(meal).where(eq(meal.id, id));
  const items = await db.select().from(mealItem).where(eq(mealItem.mealId, id));
  return toMeal(row, items);
}

export async function deleteMeal(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db.delete(meal).where(and(eq(meal.id, id), eq(meal.userId, userId))).returning({ id: meal.id });
  return rows.length > 0;
}

// ---- Refresh de un alimento contra USDA: sus ítems de comida ----

/** Un ítem de comida que referencia un alimento, con lo mínimo para re-snapshotearlo. */
export interface ItemDeAlimento {
  id: string;
  mealId: string;
  quantity: number;
  quantityUnit: string;
}

/**
 * Los ítems de comida DEL USUARIO que referencian este alimento.
 *
 * ⚠️ El JOIN con `meal.user_id` NO es decorativo: `meal_item` no tiene `userId` propio, así que
 * sin él un `food_id` compartido alcanzaría comidas de OTRO usuario. Los ítems huérfanos
 * (`food_id = null`, de alimentos borrados) quedan fuera solos: `null` no iguala a ningún id.
 */
export async function listItemsOfFood(db: DbOrTx, userId: string, foodId: string): Promise<ItemDeAlimento[]> {
  return db
    .select({ id: mealItem.id, mealId: mealItem.mealId, quantity: mealItem.quantity, quantityUnit: mealItem.quantityUnit })
    .from(mealItem)
    .innerJoin(meal, eq(meal.id, mealItem.mealId))
    .where(and(eq(mealItem.foodId, foodId), eq(meal.userId, userId)));
}

/** Cuántas comidas del usuario tienen al menos un ítem de este alimento. */
export async function countMealsWithFood(db: DbOrTx, userId: string, foodId: string): Promise<number> {
  const items = await listItemsOfFood(db, userId, foodId);
  return new Set(items.map((it) => it.mealId)).size;
}

/**
 * Recalcula el snapshot de cada ítem de comida de este alimento con la fila YA actualizada del
 * catálogo, reusando `snapshotItems` —la MISMA función que creó los snapshots originales—.
 *
 * ⚠️ `snapshotItems` también reescribe `foodName`. Es correcto (si el alimento se renombró, el
 * snapshot se pone al día) pero no es obvio leyendo el UPDATE.
 *
 * Las cantidades NO cambian: 150 g siguen siendo 150 g; lo que cambia es la densidad de
 * nutrientes. `mealsUpdated`/`itemsUpdated` se cuentan sobre lo que la base DEVOLVIÓ haber
 * escrito (`returning`), no sobre la lista que se pidió actualizar.
 */
export async function resnapshotItemsOfFood(
  db: DbOrTx, userId: string, foodId: string, row: FoodRow,
): Promise<{ mealsUpdated: number; itemsUpdated: number }> {
  const items = await listItemsOfFood(db, userId, foodId);
  if (items.length === 0) return { mealsUpdated: 0, itemsUpdated: 0 };
  const snapped = snapshotItems(
    items.map((it) => ({ foodId, quantity: it.quantity, quantityUnit: it.quantityUnit as QuantityUnit })),
    new Map([[foodId, row]]),
  );
  const comidas = new Set<string>();
  let itemsUpdated = 0;
  // Zip por índice: snapshotItems preserva el orden de entrada (mapea 1 a 1).
  for (let i = 0; i < snapped.length; i++) {
    const { foodId: _mismoAlimento, ...valores } = snapped[i];
    const escritas = await db.update(mealItem).set(valores)
      .where(eq(mealItem.id, items[i].id))
      .returning({ id: mealItem.id, mealId: mealItem.mealId });
    for (const fila of escritas) {
      comidas.add(fila.mealId);
      itemsUpdated++;
    }
  }
  return { mealsUpdated: comidas.size, itemsUpdated };
}

// ---- Water log (agua tomada) ----
type WaterRow = typeof waterLog.$inferSelect;
function toWaterLog(row: WaterRow): WaterLog {
  return { id: row.id, ml: row.ml, loggedAt: row.loggedAt };
}

export async function insertWater(db: Db, userId: string, input: WaterLogInput): Promise<WaterLog> {
  const [row] = await db.insert(waterLog).values({ userId, ml: input.ml, loggedAt: input.loggedAt }).returning();
  return toWaterLog(row);
}

export async function listWater(db: Db, userId: string, from?: number, to?: number): Promise<WaterLog[]> {
  const conds = [eq(waterLog.userId, userId)];
  if (from != null) conds.push(gte(waterLog.loggedAt, from));
  if (to != null) conds.push(lte(waterLog.loggedAt, to));
  // Desempate por createdAt: si dos cargas comparten loggedAt (p.ej. dos vasos en el mismo día pasado, que usan
  // el mismo "noon"), el orden queda determinístico → "deshacer último" en el móvil borra la última realmente insertada.
  const rows = await db.select().from(waterLog).where(and(...conds)).orderBy(asc(waterLog.loggedAt), asc(waterLog.createdAt));
  return rows.map(toWaterLog);
}

export async function deleteWater(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db.delete(waterLog).where(and(eq(waterLog.id, id), eq(waterLog.userId, userId))).returning({ id: waterLog.id });
  return rows.length > 0;
}

// ---- Objetivo nutricional (metas) ----
const DEFAULT_GOAL: NutritionGoalInput = { objective: "maintain", rateKgPerWeek: 0, manualKcal: null };

export async function getGoalInput(db: Db, userId: string): Promise<NutritionGoalInput> {
  const row = await db.query.nutritionGoal.findFirst({ where: eq(nutritionGoal.userId, userId) });
  if (!row) return { ...DEFAULT_GOAL }; // copia: no compartir la referencia del default
  return {
    objective: row.objective as NutritionGoalInput["objective"],
    rateKgPerWeek: row.rateKgPerWeek,
    manualKcal: row.manualKcal ?? null,
  };
}

export async function upsertGoalInput(db: Db, userId: string, input: NutritionGoalInput): Promise<NutritionGoalInput> {
  const values = { objective: input.objective, rateKgPerWeek: input.rateKgPerWeek, manualKcal: input.manualKcal ?? null };
  await db.insert(nutritionGoal)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: nutritionGoal.userId, set: { ...values, updatedAt: new Date() } });
  return values;
}
