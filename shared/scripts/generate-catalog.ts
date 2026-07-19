#!/usr/bin/env bun
/**
 * Generator: reads Garmin FIT SDK exercise names and produces
 * shared/src/catalog/exercises.data.ts
 *
 * Run from repo root:
 *   bun run shared/scripts/generate-catalog.ts
 */

import { Profile } from "@garmin/fitsdk";
import { writeFileSync } from "fs";
import { resolve } from "path";
import type { CatalogExercise, MuscleGroup, Equipment } from "../src/index";

// ── Types ────────────────────────────────────────────────────────────────────

type MuscleGroupVal = MuscleGroup;
type EquipmentVal = Equipment;

interface CategoryConfig {
  sdkKey: string;
  garminCategoryName: string; // SCREAMING_SNAKE
  primary: MuscleGroupVal[];
  secondary: MuscleGroupVal[];
}

// ── Category map ─────────────────────────────────────────────────────────────

const CATEGORIES: CategoryConfig[] = [
  { sdkKey: "benchPressExerciseName",        garminCategoryName: "BENCH_PRESS",         primary: ["chest"],                          secondary: ["triceps", "shoulders"] },
  { sdkKey: "calfRaiseExerciseName",          garminCategoryName: "CALF_RAISE",           primary: ["calves"],                         secondary: [] },
  { sdkKey: "carryExerciseName",              garminCategoryName: "CARRY",                primary: ["full_body"],                      secondary: ["forearms", "abs"] },
  { sdkKey: "chopExerciseName",               garminCategoryName: "CHOP",                 primary: ["abs"],                            secondary: ["shoulders", "back"] },
  { sdkKey: "coreExerciseName",               garminCategoryName: "CORE",                 primary: ["abs"],                            secondary: [] },
  { sdkKey: "crunchExerciseName",             garminCategoryName: "CRUNCH",               primary: ["abs"],                            secondary: [] },
  { sdkKey: "curlExerciseName",               garminCategoryName: "CURL",                 primary: ["biceps"],                         secondary: ["forearms"] },
  { sdkKey: "deadliftExerciseName",           garminCategoryName: "DEADLIFT",             primary: ["hamstrings", "glutes", "back"],   secondary: [] },
  { sdkKey: "flyeExerciseName",               garminCategoryName: "FLYE",                 primary: ["chest"],                          secondary: ["shoulders"] },
  { sdkKey: "hipRaiseExerciseName",           garminCategoryName: "HIP_RAISE",            primary: ["glutes"],                         secondary: ["hamstrings"] },
  { sdkKey: "hipStabilityExerciseName",       garminCategoryName: "HIP_STABILITY",        primary: ["glutes"],                         secondary: ["abs"] },
  { sdkKey: "hipSwingExerciseName",           garminCategoryName: "HIP_SWING",            primary: ["glutes"],                         secondary: ["hamstrings"] },
  { sdkKey: "hyperextensionExerciseName",     garminCategoryName: "HYPEREXTENSION",       primary: ["back"],                           secondary: ["glutes", "hamstrings"] },
  { sdkKey: "lateralRaiseExerciseName",       garminCategoryName: "LATERAL_RAISE",        primary: ["shoulders"],                      secondary: [] },
  { sdkKey: "legCurlExerciseName",            garminCategoryName: "LEG_CURL",             primary: ["hamstrings"],                     secondary: [] },
  { sdkKey: "legRaiseExerciseName",           garminCategoryName: "LEG_RAISE",            primary: ["abs"],                            secondary: [] },
  { sdkKey: "lungeExerciseName",              garminCategoryName: "LUNGE",                primary: ["quads"],                          secondary: ["glutes", "hamstrings"] },
  { sdkKey: "olympicLiftExerciseName",        garminCategoryName: "OLYMPIC_LIFT",         primary: ["full_body"],                      secondary: ["quads", "shoulders"] },
  { sdkKey: "plankExerciseName",              garminCategoryName: "PLANK",                primary: ["abs"],                            secondary: ["full_body"] },
  { sdkKey: "plyoExerciseName",               garminCategoryName: "PLYO",                 primary: ["full_body"],                      secondary: ["quads"] },
  { sdkKey: "pullUpExerciseName",             garminCategoryName: "PULL_UP",              primary: ["back"],                           secondary: ["biceps"] },
  { sdkKey: "pushUpExerciseName",             garminCategoryName: "PUSH_UP",              primary: ["chest"],                          secondary: ["triceps", "shoulders"] },
  { sdkKey: "rowExerciseName",                garminCategoryName: "ROW",                  primary: ["back"],                           secondary: ["biceps"] },
  { sdkKey: "shoulderPressExerciseName",      garminCategoryName: "SHOULDER_PRESS",       primary: ["shoulders"],                      secondary: ["triceps"] },
  { sdkKey: "shoulderStabilityExerciseName",  garminCategoryName: "SHOULDER_STABILITY",   primary: ["shoulders"],                      secondary: [] },
  { sdkKey: "shrugExerciseName",              garminCategoryName: "SHRUG",                primary: ["back"],                           secondary: ["forearms"] },
  { sdkKey: "sitUpExerciseName",              garminCategoryName: "SIT_UP",               primary: ["abs"],                            secondary: [] },
  { sdkKey: "squatExerciseName",              garminCategoryName: "SQUAT",                primary: ["quads"],                          secondary: ["glutes", "hamstrings"] },
  { sdkKey: "totalBodyExerciseName",          garminCategoryName: "TOTAL_BODY",           primary: ["full_body"],                      secondary: [] },
  { sdkKey: "tricepsExtensionExerciseName",   garminCategoryName: "TRICEPS_EXTENSION",    primary: ["triceps"],                        secondary: [] },
];

// ── Exotic-equipment exclusion keywords ──────────────────────────────────────

const EXOTIC_KEYWORDS = [
  "swiss ball", "stability ball", "bosu", "medicine ball", "med ball",
  "foam roller", "sandbag", "sled", "tire", "battle", "sledge",
  "landmine", "wheel", "ring",
];

// ── Junk-name denylist ───────────────────────────────────────────────────────

const JUNK_KEYWORDS = [
  "bottle", "towel", "partner", "chair", "desk", "broomstick",
  "soup can", " can ", "water bottle",
];

// ── Categories with a "loaded" default (barbell when no implement detected) ──

const LOADED_DEFAULT_CATEGORIES = new Set([
  "olympicLiftExerciseName",
  "deadliftExerciseName",
  "benchPressExerciseName",
]);

// ── Bodyweight-friendly categories ──────────────────────────────────────────

const BODYWEIGHT_FRIENDLY_CATEGORIES = new Set([
  "calfRaiseExerciseName",
  "carryExerciseName",
  "chopExerciseName",
  "coreExerciseName",
  "crunchExerciseName",
  "hipRaiseExerciseName",
  "hipStabilityExerciseName",
  "hipSwingExerciseName",
  "hyperextensionExerciseName",
  "legRaiseExerciseName",
  "lungeExerciseName",
  "plankExerciseName",
  "plyoExerciseName",
  "pullUpExerciseName",
  "pushUpExerciseName",
  "shoulderStabilityExerciseName",
  "sitUpExerciseName",
  "squatExerciseName",
  "totalBodyExerciseName",
]);

// ── Bodyweight staple tokens ─────────────────────────────────────────────────

const BODYWEIGHT_STAPLE_TOKENS = [
  "push up", "pushup", "pull up", "pullup", "chin", "dip", "plank",
  "crunch", "sit up", "situp", "squat", "lunge", "bridge", "raise",
  "hold", "burpee", "jump", "mountain", "hollow", "superman", "bird dog",
  "step up", "russian twist", "flutter", "bicycle", "v up", "v-up",
  "leg raise", "glute",
];

// ── Equipment bucket priority order ──────────────────────────────────────────

const BUCKET_PRIORITY: EquipmentVal[] = [
  "barbell", "dumbbell", "cable_machine", "machine", "kettlebell",
  "bodyweight", "pull_up_bar", "resistance_band", "trx",
];

// ── Ejercicios básicos garantizados ──────────────────────────────────────────
// El criterio de selección (menos palabras, alfabético) no sabe qué ejercicio es importante:
// deja entrar "Barbell Stepover" y descarta el leg press. Estos entran SIEMPRE, sin competir
// por el cap. Claves = sdkKey de CATEGORIES; valores = camelName exacto del SDK de Garmin.
const MUST_INCLUDE: Record<string, string[]> = {
  benchPressExerciseName: ["inclineDumbbellBenchPress", "closeGripBarbellBenchPress", "inclineBarbellBenchPress", "wideGripBarbellBenchPress", "declineDumbbellBenchPress"],
  rowExerciseName: ["seatedCableRow", "tBarRow", "oneArmBentOverRow", "chestSupportedDumbbellRow"],
  pullUpExerciseName: ["pullUp", "wideGripLatPulldown", "closeGripLatPulldown"],
  squatExerciseName: ["legPress", "gobletSquat", "barbellFrontSquat", "dumbbellSplitSquat", "barbellHackSquat", "wideStanceBarbellSquat", "barbellStepUp", "dumbbellStepUp", "overheadBarbellSquat"],
  flyeExerciseName: ["dumbbellFlye", "cableCrossover", "inclineDumbbellFlye"],
  curlExerciseName: ["dumbbellHammerCurl", "ezBarPreacherCurl", "closeGripEzBarBicepsCurl", "inclineDumbbellBicepsCurl", "crossBodyDumbbellHammerCurl"],
  tricepsExtensionExerciseName: ["lyingEzBarTricepsExtension", "singleArmDumbbellOverheadTricepsExtension", "seatedDumbbellOverheadTricepsExtension", "bodyWeightDip", "reverseGripTricepsPressdown"],
  shoulderPressExerciseName: ["dumbbellShoulderPress", "barbellShoulderPress", "arnoldPress", "singleArmDumbbellShoulderPress"],
  deadliftExerciseName: ["romanianDeadlift", "sumoDeadlift", "barbellDeadlift"],
  lateralRaiseExerciseName: ["seatedRearLateralRaise", "bentOverLateralRaise"],
  lungeExerciseName: ["walkingLunge"],
  coreExerciseName: ["weightedSideBend"],
  crunchExerciseName: ["flutterKicks"],
};

// inferEquipment falla en tres casos y acá va el equipamiento real:
//  1. El SDK nombra el ejercicio sin mencionar el implemento ("T Bar Row", "Arnold Press",
//     "Leg Press", "Goblet Squat"), así que quedan etiquetados "bodyweight" e
//     isLegitBodyweight los descartaría, aunque son ejercicios con carga.
//  2. El ejercicio hereda el equipamiento de su categoría y no le corresponde: los jalones
//     al pecho viven bajo pullUpExerciseName, pero se hacen en polea, no en barra fija.
//  3. El nombre engaña a la heurística: "Dumbbell Hammer Curl" activa la regla de "hammer"
//     (pensada para las máquinas Hammer Strength) y le agrega un "machine" que no existe,
//     escondiéndole el curl martillo a quien solo tiene mancuernas. Al revés también pasa:
//     las aperturas y el remo con pecho apoyado necesitan banco, pero su nombre de Garmin
//     no dice "bench" y se le recetarían a alguien sin banco.
// Ojo: catalogForEquipment() exige TODO lo listado, así que un implemento de más esconde
// el ejercicio y uno de menos se lo receta a quien no puede hacerlo.
const MUST_EQUIPMENT: Record<string, EquipmentVal[]> = {
  tBarRow: ["barbell"],
  oneArmBentOverRow: ["dumbbell"],
  arnoldPress: ["dumbbell"],
  legPress: ["machine"],
  gobletSquat: ["dumbbell"],
  wideGripLatPulldown: ["cable_machine"],
  closeGripLatPulldown: ["cable_machine"],
  chestSupportedDumbbellRow: ["dumbbell", "bench"],
  dumbbellFlye: ["dumbbell", "bench"],
  inclineDumbbellFlye: ["dumbbell", "bench"],
  dumbbellHammerCurl: ["dumbbell"],
  weightedSideBend: ["dumbbell"],
  bentOverLateralRaise: ["dumbbell"],
  seatedRearLateralRaise: ["dumbbell"],
  crossBodyDumbbellHammerCurl: ["dumbbell"],
  reverseGripTricepsPressdown: ["cable_machine"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** camelCase → "Title Case Words" */
function humanize(camel: string): string {
  // Insert space before uppercase letters, but only when preceded by a lowercase letter or digit
  const spaced = camel.replace(/([a-z\d])([A-Z])/g, "$1 $2");
  return spaced
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** camelCase → snake_case */
function slug(camel: string): string {
  return camel
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

/** Determine equipment array from humanized name (lowercase) and category */
function inferEquipment(lower: string, sdkKey: string): EquipmentVal[] {
  const set = new Set<EquipmentVal>();

  if (lower.includes("barbell") || lower.includes("ez bar") || lower.includes("ezbar")) {
    set.add("barbell");
  }
  if (lower.includes("dumbbell")) {
    set.add("dumbbell");
  }
  if (lower.includes("kettlebell")) {
    set.add("kettlebell");
  }
  if (lower.includes("cable")) {
    set.add("cable_machine");
  }
  if (lower.includes("machine") || lower.includes("smith") || lower.includes("leverage") ||
      lower.includes("hammer") || lower.includes("lever")) {
    set.add("machine");
  }
  if (lower.includes("band") || lower.includes("banded") || lower.includes("resistance")) {
    set.add("resistance_band");
  }
  if (lower.includes("suspension") || lower.includes("trx")) {
    set.add("trx");
  }
  if (lower.includes("bench")) {
    set.add("bench");
  }
  if (sdkKey === "pullUpExerciseName" && set.size === 0) {
    set.add("pull_up_bar");
  }
  if (set.size === 0) {
    // Use barbell as default for inherently loaded categories
    if (LOADED_DEFAULT_CATEGORIES.has(sdkKey)) {
      set.add("barbell");
    } else {
      set.add("bodyweight");
    }
  }

  return Array.from(set);
}

/** Check if a humanized (lowercased) name should be excluded */
function isExcluded(lower: string): boolean {
  if (EXOTIC_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  if (JUNK_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  return false;
}

/** Word count helper */
function wordCount(s: string): number {
  return s.split(" ").length;
}

/** Get the primary bucket for an equipment array */
function getBucket(equipment: EquipmentVal[]): EquipmentVal {
  const eqSet = new Set(equipment);
  for (const bucket of BUCKET_PRIORITY) {
    if (eqSet.has(bucket)) return bucket;
  }
  return "bodyweight";
}

/** Check if a bodyweight-bucketed candidate is a legitimate bodyweight exercise */
function isLegitBodyweight(lower: string, sdkKey: string): boolean {
  if (BODYWEIGHT_FRIENDLY_CATEGORIES.has(sdkKey)) return true;
  return BODYWEIGHT_STAPLE_TOKENS.some((token) => lower.includes(token));
}

// ── Main generation ──────────────────────────────────────────────────────────

function generate(cap: number): CatalogExercise[] {
  const types = Profile.types as Record<string, Record<string, string>>;
  const usedIds = new Map<string, number>(); // slug → count for dedup
  const catSnakeMap = new Map<string, string>(); // sdkKey → category_snake prefix

  // Pre-build category prefix map
  for (const cfg of CATEGORIES) {
    const catCamel = cfg.sdkKey.replace("ExerciseName", "");
    catSnakeMap.set(cfg.sdkKey, slug(catCamel));
  }

  const catalog: CatalogExercise[] = [];

  for (const cfg of CATEGORIES) {
    const rawEntries = types[cfg.sdkKey];
    if (!rawEntries) {
      console.warn(`WARNING: SDK key not found: ${cfg.sdkKey}`);
      continue;
    }

    // Build candidates with equipment inferred
    interface Candidate {
      camelName: string;
      garminName: string;
      lower: string;
      equipment: EquipmentVal[];
      bucket: EquipmentVal;
    }

    const candidates: Candidate[] = [];
    for (const [, camelName] of Object.entries(rawEntries)) {
      const garminName = humanize(camelName);
      const lower = garminName.toLowerCase();
      if (isExcluded(lower)) continue;
      const isMust = (MUST_INCLUDE[cfg.sdkKey] ?? []).includes(camelName);
      const equipment = [...(MUST_EQUIPMENT[camelName] ?? inferEquipment(lower, cfg.sdkKey))];
      const bucket = getBucket(equipment);

      // For bodyweight bucket, filter out likely mis-tagged weighted moves.
      // La lista curada de MUST_INCLUDE no pasa por esta heurística: es exactamente
      // el criterio mecánico que MUST_INCLUDE viene a corregir.
      if (bucket === "bodyweight" && !isMust && !isLegitBodyweight(lower, cfg.sdkKey)) continue;

      // Colgarse de una barra no es opcional aunque el nombre mencione otro implemento:
      // "Band Assisted Pull Up" necesita la banda Y la barra donde anclarla (ver 3ef1fa4,
      // que arregló esto a mano en el .data y por eso se perdía en cada regeneración).
      // Va DESPUÉS de getBucket a propósito: la barra es un requisito extra, no el
      // implemento que define el bucket — si definiera el bucket, estos ejercicios
      // saldrían del cupo chico de resistance_band y los expulsaría la competencia.
      if (
        cfg.sdkKey === "pullUpExerciseName" &&
        /\b(pull|chin)\s?ups?\b/.test(lower) &&
        !equipment.includes("pull_up_bar")
      ) {
        equipment.push("pull_up_bar");
      }

      candidates.push({ camelName, garminName, lower, equipment, bucket });
    }

    // Group into buckets, sort each by (word count ASC, name ASC)
    const bucketMap = new Map<EquipmentVal, Candidate[]>();
    for (const cand of candidates) {
      const list = bucketMap.get(cand.bucket) ?? [];
      list.push(cand);
      bucketMap.set(cand.bucket, list);
    }
    for (const [, list] of bucketMap) {
      list.sort((a, b) => {
        const wdiff = wordCount(a.garminName) - wordCount(b.garminName);
        if (wdiff !== 0) return wdiff;
        return a.garminName.localeCompare(b.garminName);
      });
    }

    // Los básicos entran primero y no consumen cupo del cap.
    const mustCamel = new Set(MUST_INCLUDE[cfg.sdkKey] ?? []);
    const forced = candidates.filter((c) => mustCamel.has(c.camelName));

    // Guarda: si un nombre de MUST_INCLUDE no llegó a candidatos (tipeo, o lo filtró isExcluded),
    // reventamos. Si no, un tipeo no hace nada y nadie se entera.
    if (forced.length !== mustCamel.size) {
      const encontrados = new Set(forced.map((c) => c.camelName));
      const perdidos = [...mustCamel].filter((n) => !encontrados.has(n));
      throw new Error(
        `MUST_INCLUDE[${cfg.sdkKey}]: estos nombres no existen en el SDK o los filtró isExcluded/isLegitBodyweight: ${perdidos.join(", ")}`,
      );
    }

    // Round-robin selection across buckets in priority order
    const bucketPointers = new Map<EquipmentVal, number>();
    for (const b of BUCKET_PRIORITY) bucketPointers.set(b, 0);

    const selected: Candidate[] = [...forced];
    const target = cap + forced.length;
    let added = true;
    while (selected.length < target && added) {
      added = false;
      for (const bucket of BUCKET_PRIORITY) {
        if (selected.length >= target) break;
        const list = bucketMap.get(bucket);
        if (!list) continue;
        // Saltar los que ya entraron como forzados SIN perder el turno del bucket:
        // si el `continue` fuera afuera, el bucket que contiene un forzado aportaría
        // uno menos por ronda y expulsaría a un elegido que antes entraba.
        let ptr = bucketPointers.get(bucket)!;
        while (ptr < list.length && mustCamel.has(list[ptr].camelName)) ptr++;
        if (ptr >= list.length) {
          bucketPointers.set(bucket, ptr);
          continue;
        }
        selected.push(list[ptr]);
        bucketPointers.set(bucket, ptr + 1);
        added = true;
      }
    }

    const catPrefix = catSnakeMap.get(cfg.sdkKey)!;

    for (const { camelName, garminName, equipment } of selected) {
      let id = slug(camelName);

      // Uniqueness: if id already taken, prefix with category snake
      if (usedIds.has(id)) {
        id = `${catPrefix}_${id}`;
      }
      // If still taken, append _2, _3, etc.
      if (usedIds.has(id)) {
        let suffix = 2;
        while (usedIds.has(`${id}_${suffix}`)) suffix++;
        id = `${id}_${suffix}`;
      }

      usedIds.set(id, 1);

      const entry: CatalogExercise = {
        id,
        garminCategory: cfg.garminCategoryName,
        garminName,
        displayName: garminName,
        primaryMuscles: cfg.primary,
        secondaryMuscles: cfg.secondary,
        equipment,
      };

      catalog.push(entry);
    }
  }

  return catalog;
}

// ── Find ideal CAP ───────────────────────────────────────────────────────────

// El cap NO puede bajar de 8: los ids congelados (catalogIds.frozen.ts) son los que
// eligió el algoritmo con cap = 8, y los programas guardados de los usuarios los
// referencian. Bajarlo expulsa el 8º de cada categoría y rompe esos programas.
// Por eso la cota superior contempla los MUST_INCLUDE, que suman por encima del cap.
const MIN_CAP = 8;
const MAX_TOTAL = 300;

let cap = MIN_CAP;
let catalog = generate(cap);

if (catalog.length < 150) {
  while (catalog.length < 150 && cap < 50) {
    cap++;
    catalog = generate(cap);
  }
} else if (catalog.length > MAX_TOTAL) {
  while (catalog.length > MAX_TOTAL && cap > MIN_CAP) {
    cap--;
    catalog = generate(cap);
  }
}

// Si el catálogo excede el máximo estando ya en MIN_CAP, el bucle de arriba no tiene margen
// para bajar el cap y escribiría un archivo sobredimensionado en silencio. Preferimos reventar
// acá que descubrirlo en CI, igual que hace la guarda de MUST_INCLUDE.
if (catalog.length > MAX_TOTAL) {
  throw new Error(
    `El catálogo generado tiene ${catalog.length} ejercicios y el máximo es ${MAX_TOTAL}. ` +
      `El cap ya está en el piso (${MIN_CAP}), que no se puede bajar sin expulsar ids congelados. ` +
      `Revisá MUST_INCLUDE o subí MAX_TOTAL a conciencia (y la cota del test en exercises.test.ts).`,
  );
}

console.log(`\nFinal CAP = ${cap}, TOTAL = ${catalog.length} exercises`);

// Per-category counts
const catCounts = new Map<string, number>();
for (const e of catalog) {
  catCounts.set(e.garminCategory, (catCounts.get(e.garminCategory) ?? 0) + 1);
}
console.log("Per-category counts:");
for (const [cat, count] of [...catCounts.entries()].sort()) {
  console.log(`  ${cat}: ${count}`);
}

// Equipment distribution
const eqCounts: Record<string, number> = {};
for (const e of catalog) {
  for (const eq of e.equipment) {
    eqCounts[eq] = (eqCounts[eq] ?? 0) + 1;
  }
}
console.log("Equipment distribution:", eqCounts);

// ── Serialize entries ─────────────────────────────────────────────────────────

function serializeArray(arr: string[]): string {
  if (arr.length === 0) return "[]";
  return `[${arr.map((s) => `"${s}"`).join(", ")}]`;
}

function serializeEntry(e: CatalogExercise): string {
  return (
    `  {\n` +
    `    id: "${e.id}",\n` +
    `    garminCategory: "${e.garminCategory}",\n` +
    `    garminName: "${e.garminName}",\n` +
    `    displayName: "${e.displayName}",\n` +
    `    primaryMuscles: ${serializeArray(e.primaryMuscles)},\n` +
    `    secondaryMuscles: ${serializeArray(e.secondaryMuscles)},\n` +
    `    equipment: ${serializeArray(e.equipment)},\n` +
    `  }`
  );
}

// ── Write output file ────────────────────────────────────────────────────────

const outPath = resolve(import.meta.dir, "../src/catalog/exercises.data.ts");

const lines = [
  "// AUTO-GENERATED by scripts/generate-catalog.ts — do not edit by hand.",
  `import type { CatalogExercise } from "../index";`,
  ``,
  `export const EXERCISE_CATALOG_DATA: CatalogExercise[] = [`,
  catalog.map(serializeEntry).join(",\n"),
  `];`,
  ``,
];

writeFileSync(outPath, lines.join("\n"), "utf-8");
console.log(`\nWrote ${catalog.length} entries to ${outPath}`);
