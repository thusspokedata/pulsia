// Programas cacheados ANTES de GEN-1 tienen workouts con `focus: MuscleGroup` (string) y sin
// `targetMuscles`. Este normalizador mapea `focus` → `targetMuscles: [focus]` en cada workout para
// que el ProgramSchema (que ahora exige targetMuscles) los siga aceptando. NO muta la entrada; las
// entradas malformadas o de otra forma se devuelven tal cual (el safeParse del caller decide).
export function migrateLegacyProgramShape(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const program = data as Record<string, unknown>;
  if (!Array.isArray(program.weeks)) return data;
  return {
    ...program,
    weeks: program.weeks.map((week) => {
      if (!week || typeof week !== "object") return week;
      const w = week as Record<string, unknown>;
      if (!Array.isArray(w.workouts)) return week;
      return {
        ...w,
        workouts: w.workouts.map((workout) => {
          if (!workout || typeof workout !== "object") return workout;
          const wk = workout as Record<string, unknown>;
          if (wk.targetMuscles === undefined && typeof wk.focus === "string") {
            const { focus, ...rest } = wk;
            return { ...rest, targetMuscles: [focus] };
          }
          return workout;
        }),
      };
    }),
  };
}
