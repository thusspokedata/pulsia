import { buildYearHeatmap, type DayBurn, type HeatmapCell } from "@pulsia/shared";

// Misma rampa que el heatmap del móvil (mobile/src/components/YearHeatmap.tsx): gris para
// level 0, teal claro→oscuro para 1..4.
const LEVEL_COLORS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "#e2e8f0",
  1: "#CFE9EA",
  2: "#86C6CB",
  3: "#2E959D",
  4: "#0E7C86",
};

function cellColor(cell: HeatmapCell): string {
  if (!cell.inYear || cell.future) return "transparent";
  return LEVEL_COLORS[cell.level];
}

interface Props {
  burnByDate: Map<string, DayBurn>;
  thresholds: [number, number, number];
  year: number;
}

export function YearHeatmapGrid({ burnByDate, thresholds, year }: Props) {
  const { weeks } = buildYearHeatmap(burnByDate, thresholds, year, Date.now());

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <div
          className="grid w-max grid-flow-col grid-rows-7 gap-0.5"
          style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
        >
          {weeks.map((week, col) =>
            week.map((cell, row) => (
              <div
                key={`${col}-${row}`}
                {...(cell.inYear && !cell.future
                  ? { title: `${cell.date}: ${Math.round(cell.kcal)} kcal` }
                  : {})}
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: cellColor(cell) }}
              />
            )),
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>menos</span>
        {([0, 1, 2, 3, 4] as const).map((lvl) => (
          <div key={lvl} className="h-2.5 w-2.5 rounded-sm" style={{ background: LEVEL_COLORS[lvl] }} />
        ))}
        <span>más</span>
      </div>
    </div>
  );
}
