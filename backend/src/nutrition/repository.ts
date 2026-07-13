import { and, asc, eq, gte, lte, inArray } from "drizzle-orm";
import { food, meal, mealItem } from "../db/schema";
import { foodMacrosForQuantity } from "@pulsia/shared";
import type { Food, FoodInput, Meal, MealItem, MealItemInput, MealInput, QuantityUnit } from "@pulsia/shared";
import type { Db } from "../db/client";

type FoodRow = typeof food.$inferSelect;
type MealRow = typeof meal.$inferSelect;
type MealItemRow = typeof mealItem.$inferSelect;

// Errores esperados por input del cliente (foodId ajeno/inexistente, unidad/base incoherente) → 409, no 500.
export class MealValidationError extends Error {}

export function toFood(row: FoodRow): Food {
  return {
    id: row.id, name: row.name, basis: row.basis as Food["basis"],
    kcal: row.kcal, protein_g: row.proteinG, carbs_g: row.carbsG, fat_g: row.fatG,
    unitWeightG: row.unitWeightG, source: row.source as Food["source"],
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
        { basis: f.basis as Food["basis"], kcal: f.kcal, protein_g: f.proteinG, carbs_g: f.carbsG, fat_g: f.fatG, unitWeightG: f.unitWeightG },
        it.quantity, it.quantityUnit,
      );
    } catch (e) {
      throw new MealValidationError((e as Error).message);
    }
    return {
      foodId: f.id, foodName: f.name, quantity: it.quantity, quantityUnit: it.quantityUnit,
      grams: m.grams, kcal: m.kcal, proteinG: m.protein_g, carbsG: m.carbs_g, fatG: m.fat_g,
    };
  });
}

// ---- Foods ----
export async function insertFood(db: Db, userId: string, input: FoodInput): Promise<Food> {
  const [row] = await db.insert(food).values({
    userId, name: input.name, basis: input.basis, kcal: input.kcal,
    proteinG: input.protein_g, carbsG: input.carbs_g, fatG: input.fat_g,
    unitWeightG: input.unitWeightG, source: input.source,
  }).returning();
  return toFood(row);
}

export async function listFoods(db: Db, userId: string): Promise<Food[]> {
  const rows = await db.select().from(food).where(eq(food.userId, userId)).orderBy(asc(food.name));
  return rows.map(toFood);
}

export async function getFood(db: Db, userId: string, id: string): Promise<Food | null> {
  const row = await db.query.food.findFirst({ where: and(eq(food.id, id), eq(food.userId, userId)) });
  return row ? toFood(row) : null;
}

export async function deleteFood(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db.delete(food).where(and(eq(food.id, id), eq(food.userId, userId))).returning({ id: food.id });
  return rows.length > 0;
}

// ---- Meals ----
export async function createMeal(db: Db, userId: string, input: MealInput): Promise<Meal> {
  const ids = [...new Set(input.items.map((i) => i.foodId))];
  const foods = await db.select().from(food).where(and(eq(food.userId, userId), inArray(food.id, ids)));
  const catalog = new Map(foods.map((f) => [f.id, f]));
  const snapped = snapshotItems(input.items, catalog); // tira MealValidationError si algún foodId no es del usuario
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

export async function updateMeal(db: Db, userId: string, id: string, input: MealInput): Promise<Meal | null> {
  const owner = await getMealOwner(db, id);
  if (!owner || owner.userId !== userId) return null;
  const ids = [...new Set(input.items.map((i) => i.foodId))];
  const foods = await db.select().from(food).where(and(eq(food.userId, userId), inArray(food.id, ids)));
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
