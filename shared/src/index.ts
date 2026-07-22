/*
 * Pulsia — compañero de salud y entrenamiento self-hosted.
 * Copyright (C) 2026 thusspokedata
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
export * from "./schemas/profile";
export * from "./schemas/catalog";
export * from "./schemas/oneoff";
export * from "./schemas/program";
export * from "./catalog/exercises";
export { exerciseMediaFor, hasExerciseMedia, type ExerciseMedia } from "./catalog/exerciseMedia";
export * from "./schemas/session";
export * from "./schemas/cardio";
export * from "./session/completion";
export * from "./schemas/metrics";
export * from "./schemas/metricImport";
export * from "./schemas/ecg";
export * from "./progress/trends";
export * from "./schemas/nutrition";
export * from "./schemas/supplements";
export * from "./nutrition/nutrients";
export * from "./nutrition/macros";
export * from "./nutrition/goal";
export * from "./nutrition/exerciseBurn";
export * from "./nutrition/references";
export * from "./nutrition/breakdown";
export * from "./nutrition/nutrientLevel";
export * from "./nutrition/nutrientFilter";
export * from "./schemas/report";
export * from "./supplements/checklist";
export * from "./supplements/overlap";
