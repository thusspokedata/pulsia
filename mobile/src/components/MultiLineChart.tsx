import { View, Text } from "react-native";
import Svg, { Path, Circle, Line, G, Text as SvgText } from "react-native-svg";
import { toPath, type XY } from "../session/chart";
import { innerTicks, shortDate, fmtNum } from "../session/chartAxis";
import { colors, spacing } from "../theme/tokens";

export interface MultiLineChartSeries {
  label: string;
  color: string;
  unit?: string;
  data: XY[];
}

const W = 320;
const GL = 34;
const GR = 8;
const GT = 12;
const GB = 16;

// Varias series en una escala Y compartida (comparables entre sí), con ejes: gridlines + valores
// en Y, fechas en X, y leyenda con el color de cada serie.
export function MultiLineChart({ series, height = 176 }: { series: MultiLineChartSeries[]; height?: number }) {
  const all = series.flatMap((s) => s.data);
  if (all.length === 0) {
    return <Text style={{ color: colors.textMuted, padding: spacing.md }}>Sin datos todavía.</Text>;
  }
  const ys = all.map((p) => p.y);
  const xs = all.map((p) => p.x);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const spanY = maxY - minY;
  const plotH = height - GT - GB;
  const plotW = W - GL - GR;
  const flatX = maxX === minX; // un solo punto O varios con el mismo timestamp

  const yPix = (v: number) => (spanY === 0 ? GT + plotH / 2 : GT + (1 - (v - minY) / spanY) * plotH);
  const xPix = (x: number) => (flatX ? GL + plotW / 2 : GL + ((x - minX) / (maxX - minX)) * plotW);
  const ticks = innerTicks(minY, maxY, 4);

  const xLabels: { x: number; ts: number; anchor: "start" | "middle" | "end" }[] = flatX
    ? [{ x: xPix(minX), ts: minX, anchor: "middle" }]
    : [
        { x: GL, ts: minX, anchor: "start" },
        { x: GL + plotW / 2, ts: minX + (maxX - minX) / 2, anchor: "middle" },
        { x: W - GR, ts: maxX, anchor: "end" },
      ];

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`}>
        {[maxY, ...ticks, ...(spanY !== 0 ? [minY] : [])].map((v, i) => (
          <G key={`g-${i}`}>
            <Line
              x1={GL} y1={yPix(v)} x2={W - GR} y2={yPix(v)}
              stroke={colors.border} strokeWidth={1} opacity={v === maxY || v === minY ? 1 : 0.5}
            />
            <SvgText x={GL - 4} y={yPix(v) + 3} fontSize={10} fill={colors.textMuted} textAnchor="end">{fmtNum(v)}</SvgText>
          </G>
        ))}

        {xLabels.map((l, i) => (
          <SvgText key={`x-${i}`} x={l.x} y={height - 3} fontSize={10} fill={colors.textMuted} textAnchor={l.anchor}>
            {shortDate(l.ts)}
          </SvgText>
        ))}

        {series.map((s, i) => {
          const pts = s.data.map((d) => ({ x: xPix(d.x), y: yPix(d.y) }));
          return (
            <G key={`s-${i}`}>
              <Path d={toPath(pts)} stroke={s.color} strokeWidth={2} fill="none" />
              {pts.map((p, j) => <Circle key={j} cx={p.x} cy={p.y} r={3} fill={s.color} />)}
            </G>
          );
        })}
      </Svg>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.xs }}>
        {series.map((s, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
