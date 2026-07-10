import { pgTable, uuid, text, jsonb, timestamp, integer, bigint, boolean, doublePrecision, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { TrainingProfile, Program, PlannedExercise } from "@pulsia/shared";

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
  byUserTypeTime: index("body_metric_user_type_time_idx").on(t.userId, t.metricType, t.measuredAt),
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
