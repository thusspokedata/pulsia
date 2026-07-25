// Extrae la estructura de un entrenamiento de FUERZA de los mensajes de un `.FIT` (series, reps,
// pesos, ejercicios, plan). Puro: recibe el objeto de mensajes ya decodificado (mismo shape que
// devuelve `decoder.read(...)`) y NO decide dónde se guarda ni resuelve el catálogo — eso es del
// llamador (mapFitExercise para el catalogId, la persistencia para dónde va).
//
// Algoritmo verificado contra .FIT de fuerza reales: cada `setMesg` activa identifica su ejercicio
// por `category[0]` + `categorySubtype[0]`, que casan con `exerciseCategory` + `exerciseName` del
// `exerciseTitleMesg`. `categorySubtype[0]` es el índice `exerciseName` que consume mapFitExercise.
// `category`/`categorySubtype` vienen como arrays de hasta 3 elementos idénticos → se toma [0].

export interface FitStrengthSet {
  startedAt: number; // epoch ms del inicio de la serie (setMesg.startTime); 0 si el .FIT no lo trae.
  reps: number | null; // null en isométricos (plancha): la serie es tiempo bajo tensión, sin reps.
  weightKg: number | null; // 0 en peso corporal; null si el reloj no lo reportó.
  durationMs: number;
}
export interface FitStrengthExercise {
  category: string; // ej. "shoulderPress"
  exerciseNameIndex: number | null; // el índice del SDK; lo consume mapFitExercise para el catalogId
  displayName: string | null; // el nombre que muestra el reloj ("Dumbbell Push Press")
  sets: FitStrengthSet[]; // solo las activas; los descansos no son series
}
export interface FitStrengthPreview {
  workoutName: string | null; // wktName del plan cargado en el reloj (ej. "Push Day A")
  exercises: FitStrengthExercise[];
  totalSets: number;
  totalReps: number;
  totalVolumeKg: number; // Σ reps × peso (isométricos y series sin peso no aportan)
}

const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function parseFitStrength(messages: any): FitStrengthPreview {
  const titles: any[] = messages.exerciseTitleMesgs ?? [];
  const activeSets: any[] = (messages.setMesgs ?? []).filter((s: any) => s.setType === "active");

  const byKey = new Map<string, FitStrengthExercise>();
  const order: string[] = [];
  for (const s of activeSets) {
    const category = String(first(s.category) ?? "");
    const exerciseNameIndex = numOrNull(first(s.categorySubtype));
    const key = `${category}#${exerciseNameIndex ?? "?"}`;
    let ex = byKey.get(key);
    if (!ex) {
      const title = titles.find(
        (t) => t.exerciseCategory === category && numOrNull(t.exerciseName) === exerciseNameIndex,
      );
      ex = {
        category,
        exerciseNameIndex,
        displayName: typeof title?.wktStepName === "string" ? title.wktStepName : null,
        sets: [],
      };
      byKey.set(key, ex);
      order.push(key);
    }
    const startTime = s.startTime instanceof Date ? s.startTime.getTime() : numOrNull(s.startTime);
    ex.sets.push({
      startedAt: startTime ?? 0,
      reps: numOrNull(s.repetitions),
      weightKg: numOrNull(s.weight),
      durationMs: Math.round((numOrNull(s.duration) ?? 0) * 1000),
    });
  }

  const exercises = order.map((k) => byKey.get(k)!);
  let totalSets = 0;
  let totalReps = 0;
  let totalVolumeKg = 0;
  for (const ex of exercises) {
    for (const set of ex.sets) {
      totalSets++;
      if (set.reps != null) totalReps += set.reps;
      if (set.reps != null && set.weightKg != null) totalVolumeKg += set.reps * set.weightKg;
    }
  }

  const wktName = messages.workoutMesgs?.[0]?.wktName;
  return {
    workoutName: typeof wktName === "string" ? wktName : null,
    exercises,
    totalSets,
    totalReps,
    totalVolumeKg,
  };
}
