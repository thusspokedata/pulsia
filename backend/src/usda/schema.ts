import { pgTable, integer, text, real } from "drizzle-orm/pg-core";

// Copia local de USDA FoodData Central (dominio público). Una fila por alimento, valores por
// 100 g. NO tiene userId: es un catálogo de referencia compartido, no datos de nadie.
//
// El índice GIN de trigramas sobre `description` (para el matcher difuso) NO se expresa acá:
// drizzle-kit no representa bien `gin (description gin_trgm_ops)`, así que se agrega a mano en
// la migración SQL (ver backend/drizzle/, migración de esta misma tabla).
export const usdaFood = pgTable("usda_food", {
  fdcId: integer("fdc_id").primaryKey(),
  description: text("description").notNull(), // en inglés, tal como viene de USDA
  dataType: text("data_type").notNull(), // 'foundation' | 'sr_legacy' | 'survey'
  // Los 4 macros. A diferencia de `food`, acá son nullable: una fila de USDA puede no traerlos.
  kcal: real("kcal"),
  proteinG: real("protein_g"),
  carbsG: real("carbs_g"),
  fatG: real("fat_g"),
  // Los 30 nutrientes del registro (shared/src/nutrition/nutrients.ts), MISMO nombre de columna
  // que en `food`/`meal_item`. El test de schema.test.ts verifica que no se desincronicen.
  // Grasas
  saturatedFatG: real("saturated_fat_g"),
  omega3G: real("omega3_g"),
  omega6G: real("omega6_g"),
  cholesterolMg: real("cholesterol_mg"),
  // Carbohidratos
  sugarsG: real("sugars_g"),
  fiberG: real("fiber_g"),
  waterMl: real("water_ml"),
  // Vitaminas
  vitaminAMcg: real("vitamin_a_mcg"),
  vitaminB1Mg: real("vitamin_b1_mg"),
  vitaminB2Mg: real("vitamin_b2_mg"),
  vitaminB3Mg: real("vitamin_b3_mg"),
  vitaminB5Mg: real("vitamin_b5_mg"),
  vitaminB6Mg: real("vitamin_b6_mg"),
  vitaminB7Mcg: real("vitamin_b7_mcg"),
  vitaminB9Mcg: real("vitamin_b9_mcg"),
  vitaminB12Mcg: real("vitamin_b12_mcg"),
  vitaminCMg: real("vitamin_c_mg"),
  vitaminDMcg: real("vitamin_d_mcg"),
  vitaminEMg: real("vitamin_e_mg"),
  vitaminKMcg: real("vitamin_k_mcg"),
  cholineMg: real("choline_mg"),
  // Minerales
  calciumMg: real("calcium_mg"),
  ironMg: real("iron_mg"),
  magnesiumMg: real("magnesium_mg"),
  iodineMcg: real("iodine_mcg"),
  phosphorusMg: real("phosphorus_mg"),
  potassiumMg: real("potassium_mg"),
  seleniumMcg: real("selenium_mcg"),
  sodiumMg: real("sodium_mg"),
  zincMg: real("zinc_mg"),
});

// Versión del dataset cargado. Una sola fila (id siempre 1). Hace idempotente la carga del
// arranque: el loader compara esta versión contra la del build local antes de recargar.
export const usdaDataset = pgTable("usda_dataset", {
  id: integer("id").primaryKey(), // siempre 1
  version: text("version").notNull(),
  rowCount: integer("row_count").notNull(),
});
