import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import type { TrainingProfile, Program } from "@pulsia/shared";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
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

export const programs = pgTable("programs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  data: jsonb("data").$type<Program>().notNull(),
  profileSnapshot: jsonb("profile_snapshot").$type<TrainingProfile>().notNull(),
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
