import { pgTable, uuid, text, jsonb, timestamp, integer, bigint, boolean, doublePrecision, real, index, uniqueIndex, customType } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { TrainingProfile, Program, PlannedExercise, SupplementComponent, Frequency, AdjustmentItem, CardioSamples, CardioFitExtras } from "@pulsia/shared";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return "bytea"; },
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  aiApiKeyEncrypted: text("ai_api_key_encrypted"),
  aiModel: text("ai_model").default("claude-sonnet-4-6").notNull(),
  ecgEnabled: boolean("ecg_enabled").notNull().default(false),
  reportsEnabled: boolean("reports_enabled").notNull().default(false),
  kardiaPwEncrypted: text("kardia_pw_encrypted"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  data: jsonb("data").$type<TrainingProfile>().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const athleteMemory = pgTable("athlete_memory", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  content: text("content").default("").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const bodyMetric = pgTable("body_metric", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  metricType: text("metric_type").notNull(),
  value: doublePrecision("value").notNull(),
  measuredAt: bigint("measured_at", { mode: "number" }).notNull(), // epoch ms
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  // Único: garantiza la idempotencia de los imports (dedup por usuario + tipo + instante).
  byUserTypeTime: uniqueIndex("body_metric_user_type_time_unique_idx").on(t.userId, t.metricType, t.measuredAt),
}));

export const programs = pgTable("programs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  data: jsonb("data").$type<Program>().notNull(),
  profileSnapshot: jsonb("profile_snapshot").$type<TrainingProfile>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const generationJobs = pgTable("generation_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  status: text("status").notNull(), // 'pending' | 'done' | 'error'
  programId: uuid("program_id").references(() => programs.id),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ecgRecording = pgTable("ecg_recording", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  pdf: bytea("pdf").notNull(),
  mime: text("mime").notNull(),
  status: text("status").notNull().default("pending"),
  kardiaVerdict: text("kardia_verdict"),
  avgHr: real("avg_hr"),
  recordedAt: text("recorded_at"),
  interpretation: text("interpretation"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const food = pgTable("food", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  basis: text("basis").notNull(), // 'per_100g' | 'per_100ml'
  kcal: real("kcal").notNull(),
  proteinG: real("protein_g").notNull(),
  carbsG: real("carbs_g").notNull(),
  fatG: real("fat_g").notNull(),
  // --- Los 30 nutrientes del registro (shared/src/nutrition/nutrients.ts). TODOS nullable:
  // `null` es "no sabemos", que NO es 0. El test de schema.nutrients.test.ts verifica que no se
  // desincronicen con el registro. ---
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
  sodiumMg: real("sodium_mg"), // reemplaza a salt_g: se persiste SODIO, se muestra SAL
  zincMg: real("zinc_mg"),
  unitWeightG: real("unit_weight_g"), // nullable
  // Procedencia partida: los macros y los micros pueden venir de fuentes distintas.
  sourceMacros: text("source_macros").notNull(), // 'label' | 'ai' | 'manual'
  sourceMicros: text("source_micros"),           // 'usda' | 'ai' | null (null = sin match USDA)
  usdaFdcId: integer("usda_fdc_id"),             // fila de USDA de la que salieron los micros
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byUser: index("food_user_idx").on(t.userId),
}));

export const meal = pgTable("meal", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  eatenAt: bigint("eaten_at", { mode: "number" }).notNull(), // epoch ms
  mealType: text("meal_type"), // nullable
  note: text("note"), // nullable
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byUserTime: index("meal_user_time_idx").on(t.userId, t.eatenAt),
}));

export const mealItem = pgTable("meal_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  mealId: uuid("meal_id").references(() => meal.id, { onDelete: "cascade" }).notNull(),
  foodId: uuid("food_id").references(() => food.id, { onDelete: "set null" }), // el snapshot sobrevive
  foodName: text("food_name").notNull(),
  quantity: real("quantity").notNull(),
  quantityUnit: text("quantity_unit").notNull(),
  grams: real("grams").notNull(),
  kcal: real("kcal").notNull(),
  proteinG: real("protein_g").notNull(),
  carbsG: real("carbs_g").notNull(),
  fatG: real("fat_g").notNull(),
  // Los mismos 30 nutrientes que `food`, pero YA escalados a este ítem (snapshot). NO lleva
  // source_macros/source_micros/usda_fdc_id: el ítem guarda valores, no la procedencia.
  saturatedFatG: real("saturated_fat_g"),
  omega3G: real("omega3_g"),
  omega6G: real("omega6_g"),
  cholesterolMg: real("cholesterol_mg"),
  sugarsG: real("sugars_g"),
  fiberG: real("fiber_g"),
  waterMl: real("water_ml"),
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
  calciumMg: real("calcium_mg"),
  ironMg: real("iron_mg"),
  magnesiumMg: real("magnesium_mg"),
  iodineMcg: real("iodine_mcg"),
  phosphorusMg: real("phosphorus_mg"),
  potassiumMg: real("potassium_mg"),
  seleniumMcg: real("selenium_mcg"),
  sodiumMg: real("sodium_mg"),
  zincMg: real("zinc_mg"),
}, (t) => ({
  byMeal: index("meal_item_meal_idx").on(t.mealId),
}));

export const mealRelations = relations(meal, ({ many }) => ({
  items: many(mealItem),
}));
export const mealItemRelations = relations(mealItem, ({ one }) => ({
  meal: one(meal, { fields: [mealItem.mealId], references: [meal.id] }),
}));

export const waterLog = pgTable("water_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  ml: real("ml").notNull(),
  loggedAt: bigint("logged_at", { mode: "number" }).notNull(), // epoch ms
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byUserTime: index("water_log_user_time_idx").on(t.userId, t.loggedAt),
}));

export const nutritionGoal = pgTable("nutrition_goal", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  objective: text("objective").notNull(),            // 'lose' | 'maintain' | 'gain'
  rateKgPerWeek: real("rate_kg_per_week").notNull(), // 0 | 0.25 | 0.5
  manualKcal: integer("manual_kcal"),                // nullable: override total
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const supplement = pgTable("supplement", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  brand: text("brand"),
  servingLabel: text("serving_label").notNull(),
  components: jsonb("components").$type<SupplementComponent[]>().notNull(),
  labelMaxPerDay: text("label_max_per_day"),
  source: text("source").notNull(), // 'label' | 'estimate'
  info: text("info"),   // explicación IA de los componentes (nullable: alta manual)
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byUser: index("supplement_user_idx").on(t.userId),
}));

// Plan de tomas (PR2). Un 'active' por usuario; regenerar archiva el anterior.
export const supplementPlan = pgTable("supplement_plan", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  status: text("status").notNull(), // 'active' | 'archived'
  userNote: text("user_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byUser: index("supplement_plan_user_idx").on(t.userId),
}));

export const supplementPlanItem = pgTable("supplement_plan_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  planId: uuid("plan_id").references(() => supplementPlan.id, { onDelete: "cascade" }).notNull(),
  supplementId: uuid("supplement_id").references(() => supplement.id, { onDelete: "cascade" }).notNull(),
  slot: text("slot").notNull(), // TakeSlot
  frequency: jsonb("frequency").$type<Frequency>().notNull(),
  dose: text("dose").notNull(),
  reason: text("reason"),
}, (t) => ({
  byPlan: index("supplement_plan_item_plan_idx").on(t.planId),
}));

// Historial de tomas (PR2). Snapshot: el historial no cambia si se edita catálogo/plan.
// plan_item_id es set null (precedente meal_item.food_id): borrar suplemento/plan no borra historial.
export const supplementTake = pgTable("supplement_take", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  date: text("date").notNull(), // YYYY-MM-DD, día calendario del dispositivo
  planItemId: uuid("plan_item_id").references(() => supplementPlanItem.id, { onDelete: "set null" }), // el snapshot sobrevive
  supplementName: text("supplement_name").notNull(),
  plannedDose: text("planned_dose").notNull(),
  slot: text("slot").notNull(),
  status: text("status").notNull(), // 'taken' | 'deviated' | 'skipped'
  actualDose: text("actual_dose"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  // (user_id, date) queda cubierto como prefijo del índice único.
  oncePerItemDay: uniqueIndex("supplement_take_unique_idx").on(t.userId, t.date, t.planItemId),
}));

export const report = pgTable("report", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  kind: text("kind").notNull(),
  periodStart: bigint("period_start", { mode: "number" }).notNull(),
  periodEnd: bigint("period_end", { mode: "number" }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byUserKindPeriod: uniqueIndex("report_user_kind_period_idx").on(t.userId, t.kind, t.periodStart),
}));

// Ajuste del informe diario para el día siguiente (PR3).
export const supplementAdjustment = pgTable("supplement_adjustment", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  forDate: text("for_date").notNull(), // YYYY-MM-DD
  items: jsonb("items").$type<AdjustmentItem[]>().notNull(),
  reportId: uuid("report_id").references(() => report.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  onePerDay: uniqueIndex("supplement_adjustment_unique_idx").on(t.userId, t.forDate),
}));

export const exerciseCatalog = pgTable("exercise_catalog", {
  id: text("id").primaryKey(),
  garminCategory: text("garmin_category").notNull(),
  garminName: text("garmin_name").notNull(),
  displayName: text("display_name").notNull(),
  primaryMuscles: jsonb("primary_muscles").$type<string[]>().notNull(),
  secondaryMuscles: jsonb("secondary_muscles").$type<string[]>().notNull(),
  equipment: jsonb("equipment").$type<string[]>().notNull(),
});

export const workoutSession = pgTable("workout_session", {
  id: uuid("id").primaryKey(), // UUID generado en el cliente (no defaultRandom)
  userId: uuid("user_id").references(() => users.id).notNull(),
  programId: uuid("program_id").references(() => programs.id).notNull(),
  weekNumber: integer("week_number").notNull(),
  dayLabel: text("day_label").notNull(),
  location: text("location").notNull(),
  startedAt: bigint("started_at", { mode: "number" }).notNull(),
  endedAt: bigint("ended_at", { mode: "number" }),
  totalDurationMs: integer("total_duration_ms"),
  notes: text("notes").default("").notNull(),
  hrSeries: jsonb("hr_series").$type<{ t: number; bpm: number }[]>(),
  pauseIntervals: jsonb("pause_intervals").$type<{ startedAt: number; endedAt: number }[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sessionExercise = pgTable("session_exercise", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").references(() => workoutSession.id, { onDelete: "cascade" }).notNull(),
  catalogId: text("catalog_id").notNull(),
  garminName: text("garmin_name").notNull(),
  orderIndex: integer("order_index").notNull(),
  planned: jsonb("planned").$type<PlannedExercise>().notNull(),
  skipped: boolean("skipped").default(false).notNull(),
  note: text("note").default("").notNull(),
  substitutedFromId: text("substituted_from_id"),
});

export const setLog = pgTable("set_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionExerciseId: uuid("session_exercise_id").references(() => sessionExercise.id, { onDelete: "cascade" }).notNull(),
  setNumber: integer("set_number").notNull(),
  reps: integer("reps").notNull(),
  weightKg: doublePrecision("weight_kg"),
  rpe: integer("rpe"),
  startedAt: bigint("started_at", { mode: "number" }).notNull(),
  endedAt: bigint("ended_at", { mode: "number" }),
  durationMs: integer("duration_ms"),
  repTimestamps: jsonb("rep_timestamps").$type<number[]>().default([]).notNull(),
  hrAvg: integer("hr_avg"),
  hrMax: integer("hr_max"),
  skipped: boolean("skipped").default(false).notNull(),
});

// Cardio (caminata/running/elíptica/…). Tabla propia, NO workout_session: esa exige
// program_id (FK real a programs), week_number y day_label — una caminata no cuelga de
// ningún programa de fuerza. Ver docs/superpowers/specs/2026-07-17-cardio-*.
export const cardioActivity = pgTable("cardio_activity", {
  id: uuid("id").primaryKey(), // generado en el cliente, como workout_session
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull(), // CardioType (enum en Zod; text en PG, como location)
  startedAt: bigint("started_at", { mode: "number" }).notNull(),
  durationMs: integer("duration_ms").notNull(),
  distanceM: integer("distance_m"),
  avgHr: integer("avg_hr"),
  maxHr: integer("max_hr"),
  elevationGainM: integer("elevation_gain_m"),
  kcal: integer("kcal"),
  kcalSource: text("kcal_source").notNull(), // 'device' | 'estimate' — lo fuerza el server
  source: text("source").notNull(),          // 'manual' | 'fit'
  hrSeries: jsonb("hr_series").$type<{ t: number; bpm: number }[]>(),
  notes: text("notes").default("").notNull(),
  // Métricas extendidas del .FIT (Fase 1 de captura total): todas nullable, las actividades
  // manuales y las persistidas antes de esta feature no las traen.
  totalCycles: integer("total_cycles"),
  trainingLoad: doublePrecision("training_load"),
  trainingEffectAerobic: doublePrecision("training_effect_aerobic"),
  trainingEffectAnaerobic: doublePrecision("training_effect_anaerobic"),
  avgCadence: doublePrecision("avg_cadence"),
  maxCadence: doublePrecision("max_cadence"),
  avgFractionalCadence: doublePrecision("avg_fractional_cadence"),
  avgRespiration: doublePrecision("avg_respiration"),
  maxRespiration: doublePrecision("max_respiration"),
  minRespiration: doublePrecision("min_respiration"),
  metabolicKcal: integer("metabolic_kcal"),
  sportProfileName: text("sport_profile_name"),
  tzOffsetMinutes: integer("tz_offset_minutes"),
  // Stream columnar (reemplaza a hrSeries hacia adelante) y metadata cruda del .FIT.
  samples: jsonb("samples").$type<CardioSamples>(),
  fitExtras: jsonb("fit_extras").$type<CardioFitExtras>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  // Toda lectura es "las actividades de este usuario en este rango".
  byUserStarted: index("cardio_activity_user_started_idx").on(t.userId, t.startedAt),
}));

// Bytes crudos del .FIT, separado de cardio_activity a propósito: el listado de actividades no
// debe arrastrar el binario. 1:1 con cardio_activity, borrado en cascada.
export const cardioFitFile = pgTable("cardio_fit_file", {
  activityId: uuid("activity_id").primaryKey().references(() => cardioActivity.id, { onDelete: "cascade" }),
  bytes: bytea("bytes").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const appRelease = pgTable("app_release", {
  id: text("id").primaryKey(), // siempre "latest" (fila única)
  versionCode: integer("version_code").notNull(),
  apkUrl: text("apk_url").notNull(),
  label: text("label").default("").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workoutSessionRelations = relations(workoutSession, ({ many }) => ({
  exercises: many(sessionExercise),
}));
export const sessionExerciseRelations = relations(sessionExercise, ({ one, many }) => ({
  session: one(workoutSession, { fields: [sessionExercise.sessionId], references: [workoutSession.id] }),
  sets: many(setLog),
}));
export const setLogRelations = relations(setLog, ({ one }) => ({
  exercise: one(sessionExercise, { fields: [setLog.sessionExerciseId], references: [sessionExercise.id] }),
}));
