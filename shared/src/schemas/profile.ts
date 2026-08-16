import { z } from "zod";

export const ExperienceSchema = z.enum(["beginner", "intermediate", "advanced"]);
export const GoalSchema = z.enum(["hypertrophy", "strength", "endurance", "fat_loss", "general_fitness"]);
export const SexSchema = z.enum(["male", "female", "other", "prefer_not_to_say"]);
export type Sex = z.infer<typeof SexSchema>;

export const EquipmentSchema = z.enum([
  "bodyweight",
  "dumbbell",
  "barbell",
  "kettlebell",
  "resistance_band",
  "pull_up_bar",
  "bench",
  "cable_machine",
  "machine",
  "trx",
]);

export const ActivityLevelSchema = z.enum(["sedentary", "light", "moderate", "active"]);
export type ActivityLevel = z.infer<typeof ActivityLevelSchema>;

// Edad en años cumplidos a partir de una fecha de nacimiento ISO `YYYY-MM-DD`. Devuelve undefined
// si el string no es una fecha real o la edad no es plausible (0–120). Se calcula en UTC: para
// "años cumplidos" el huso horario no cambia el resultado de forma relevante, y así es determinista
// entre el owner (Europe/Berlin) y la familia (Argentina). `now` es inyectable para testear.
export function ageFromBirthDate(birthDate: string, now: number = Date.now()): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return undefined;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const bd = new Date(Date.UTC(y, mo - 1, d));
  // Rechaza fechas imposibles (p.ej. 30-feb, mes 13): el Date "desborda" a otro día/mes.
  if (bd.getUTCFullYear() !== y || bd.getUTCMonth() !== mo - 1 || bd.getUTCDate() !== d) return undefined;
  const n = new Date(now);
  let age = n.getUTCFullYear() - y;
  const hadBirthdayThisYear =
    n.getUTCMonth() > mo - 1 || (n.getUTCMonth() === mo - 1 && n.getUTCDate() >= d);
  if (!hadBirthdayThisYear) age -= 1;
  if (age < 0 || age > 120) return undefined;
  return age;
}

// Devuelve el perfil con `age` derivada de `birthDate` (fresca a la fecha `now`). Si no hay
// birthDate válida, lo deja intacto → `age` cargada a mano sigue siendo el fallback para perfiles
// viejos. Aplicar en los bordes de lectura (móvil `getProfile`, ruta GET del backend) para que la
// edad se actualice sola en cada cumpleaños sin tocar cada consumidor.
export function profileWithDerivedAge<T extends { birthDate?: string; age?: number }>(
  p: T, now: number = Date.now(),
): T {
  if (!p.birthDate) return p;
  const derived = ageFromBirthDate(p.birthDate, now);
  return derived != null ? { ...p, age: derived } : p;
}

export const TrainingProfileSchema = z.object({
  experience: ExperienceSchema,
  goal: GoalSchema,
  sex: SexSchema.optional(),
  // Datos antropométricos opcionales: dan contexto a la IA (cargas relativas al peso, volumen/recuperación por edad).
  // `age` es el fallback para perfiles viejos; si hay `birthDate`, la edad se deriva de ahí (se
  // mantiene fresca en cada cumpleaños). El rango 12–100 se relajará en PROD-1 (niños).
  age: z.number().int().min(12).max(100).optional(),
  // Fecha de nacimiento ISO `YYYY-MM-DD`. Fuente preferida de la edad (ver `profileWithDerivedAge`).
  birthDate: z
    .string()
    .refine((s) => ageFromBirthDate(s) != null, { message: "fecha de nacimiento inválida" })
    .optional(),
  weightKg: z.number().min(30).max(300).optional(),
  heightCm: z.number().int().min(120).max(250).optional(),
  activityLevel: ActivityLevelSchema.optional(), // actividad base SIN contar entrenamientos (semilla del TDEE)
  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(15).max(180),
  gymEquipment: z.array(EquipmentSchema),
  homeEquipment: z.array(EquipmentSchema),
  limitations: z.array(z.string()).default([]),
});

export type TrainingProfile = z.infer<typeof TrainingProfileSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;
