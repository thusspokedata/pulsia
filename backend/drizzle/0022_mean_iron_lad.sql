ALTER TABLE "food" ADD COLUMN "omega3_g" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "omega6_g" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "vitamin_a_mcg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "vitamin_b1_mg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "vitamin_b2_mg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "vitamin_b3_mg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "vitamin_b5_mg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "vitamin_b6_mg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "vitamin_b7_mcg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "vitamin_b9_mcg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "vitamin_b12_mcg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "vitamin_c_mg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "vitamin_d_mcg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "vitamin_e_mg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "vitamin_k_mcg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "choline_mg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "calcium_mg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "iron_mg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "magnesium_mg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "iodine_mcg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "phosphorus_mg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "potassium_mg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "selenium_mcg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "sodium_mg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "zinc_mg" real;--> statement-breakpoint
-- EDITADO A MANO: drizzle generaba `ADD COLUMN "source_macros" text NOT NULL`, que en Postgres
-- FALLA si la tabla ya tiene filas (no sabe qué poner en las existentes). Se agrega con DEFAULT
-- 'ai' — el mismo valor al que cae el backfill de abajo para todo lo que no sea 'label' — y el
-- DEFAULT se saca al final. Se eligió DEFAULT + DROP DEFAULT en vez de nullable → backfill →
-- SET NOT NULL porque así la columna es NOT NULL desde el primer instante: no hay ninguna ventana
-- en la que una fila pueda quedar en NULL, y por lo tanto el SET NOT NULL no puede fallar después
-- sobre una fila que el backfill no haya alcanzado. Además ADD COLUMN ... DEFAULT en PG 11+ es
-- sólo metadata (no reescribe la tabla). El DROP DEFAULT al final deja el schema idéntico al que
-- describe schema.ts, así que un `db:generate` futuro no detecta drift.
ALTER TABLE "food" ADD COLUMN "source_macros" text NOT NULL DEFAULT 'ai';--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "source_micros" text;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "usda_fdc_id" integer;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "omega3_g" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "omega6_g" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "vitamin_a_mcg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "vitamin_b1_mg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "vitamin_b2_mg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "vitamin_b3_mg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "vitamin_b5_mg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "vitamin_b6_mg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "vitamin_b7_mcg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "vitamin_b9_mcg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "vitamin_b12_mcg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "vitamin_c_mg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "vitamin_d_mcg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "vitamin_e_mg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "vitamin_k_mcg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "choline_mg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "calcium_mg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "iron_mg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "magnesium_mg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "iodine_mcg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "phosphorus_mg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "potassium_mg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "selenium_mcg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "sodium_mg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "zinc_mg" real;--> statement-breakpoint

-- ============================================================================
-- CONVERSIÓN DE DATOS (agregada a mano). Reescribe datos reales del usuario.
--
-- El orden importa y está garantizado ESTRUCTURALMENTE, no por revisión a ojo: las columnas
-- viejas (salt_g, source) se borran en la migración 0023, que es un archivo POSTERIOR. Drizzle no
-- garantiza el orden de las sentencias que genera dentro de un archivo, pero sí el orden entre
-- archivos, así que la conversión no puede correr después del DROP.
-- ============================================================================

-- 1. Sodio a partir de la sal existente. Inversa exacta de saltGFromSodiumMg (factor 2.5 =
--    peso molecular NaCl / Na). Espejo de sodiumMgFromSaltG en src/nutrition/migration0022.ts.
--    El WHERE ... IS NOT NULL deja en NULL lo que no tenía sal: NULL es "no sabemos", 0 sería
--    afirmar "no tiene sodio".
UPDATE "food"      SET "sodium_mg" = ROUND(("salt_g" * 1000) / 2.5) WHERE "salt_g" IS NOT NULL;--> statement-breakpoint
UPDATE "meal_item" SET "sodium_mg" = ROUND(("salt_g" * 1000) / 2.5) WHERE "salt_g" IS NOT NULL;--> statement-breakpoint

-- 2. Procedencia de los macros: lo que decía 'label' sigue siendo 'label'; todo el resto
--    ('estimate') lo cargó la IA, así que pasa a 'ai'.
UPDATE "food" SET "source_macros" = CASE WHEN "source" = 'label' THEN 'label' ELSE 'ai' END;--> statement-breakpoint

-- 3. source_micros queda NULL a propósito en todas las filas: todavía no hay vitaminas ni
--    minerales cargados, y NULL es justamente "el bloque de micros está vacío". Poner 'ai' sería
--    mentir sobre el origen de datos que no existen.

-- 4. Ya backfilleada, la columna no necesita más el DEFAULT (ver comentario de arriba).
ALTER TABLE "food" ALTER COLUMN "source_macros" DROP DEFAULT;