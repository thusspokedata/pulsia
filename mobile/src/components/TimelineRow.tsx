import { View, Text, Pressable } from "react-native";
import { CARDIO_LABELS, type CardioActivity, type CardioType } from "@pulsia/shared";
import type { SessionListItem } from "../api/sessions";
import type { TimelineItem } from "../session/timeline";
import { colors, spacing, radius } from "../theme/tokens";

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

// Distancia en km con coma decimal (es-AR): 2500 m → "2,5 km".
function fmtKm(m: number): string {
  return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

const CARDIO_EMOJI = {
  walk: "🚶",
  run: "🏃",
  elliptical: "⚙️",
  bike: "🚴",
  swim: "🏊",
  rowing: "🚣",
  other: "🤸",
} satisfies Record<CardioType, string>;

const rowStyle = {
  flexDirection: "row" as const,
  justifyContent: "space-between" as const,
  alignItems: "center" as const,
  backgroundColor: colors.surface,
  borderRadius: radius.md,
  padding: spacing.md,
  gap: spacing.sm,
};

type Props = {
  item: TimelineItem;
  disabled?: boolean;
  onOpenSession: (s: SessionListItem) => void;
  onDeleteSession: (s: SessionListItem) => void;
  onOpenCardio: (a: CardioActivity) => void;
  onDeleteCardio: (a: CardioActivity) => void;
};

// Fila del historial unificado: renderiza una sesión de fuerza o una actividad de cardio
// según el `kind` del TimelineItem. La sesión mantiene exactamente el comportamiento previo
// (tap → detalle inline, 🗑 → confirmación de borrado de sesión).
export function TimelineRow({ item, disabled, onOpenSession, onDeleteSession, onOpenCardio, onDeleteCardio }: Props) {
  if (item.kind === "session") {
    const s = item.session;
    return (
      <Pressable testID={`hist-item-${s.id}`} onPress={() => onOpenSession(s)} disabled={disabled} style={rowStyle}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
            {s.dayLabel}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{fmtDate(s.startedAt)}</Text>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>⏱ {fmt(s.totalDurationMs ?? 0)}</Text>
        <Text testID={`hist-pct-${s.id}`} style={{ color: colors.textMuted, fontSize: 13 }}>{`${s.completionPct}%`}</Text>
        <Pressable
          testID={`hist-del-${s.id}`}
          onPress={() => onDeleteSession(s)}
          hitSlop={8}
          style={{ paddingHorizontal: spacing.xs, paddingVertical: spacing.xs }}
        >
          <Text style={{ fontSize: 16 }}>🗑</Text>
        </Pressable>
      </Pressable>
    );
  }

  const a = item.activity;
  return (
    <Pressable testID={`cardio-item-${a.id}`} onPress={() => onOpenCardio(a)} disabled={disabled} style={rowStyle}>
      <Text style={{ fontSize: 18 }}>{CARDIO_EMOJI[a.type]}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
          {CARDIO_LABELS[a.type]}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{fmtDate(a.startedAt)}</Text>
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>⏱ {fmt(a.durationMs)}</Text>
      {a.distanceM != null && (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{fmtKm(a.distanceM)}</Text>
      )}
      <Pressable
        testID={`cardio-del-${a.id}`}
        onPress={() => onDeleteCardio(a)}
        hitSlop={8}
        style={{ paddingHorizontal: spacing.xs, paddingVertical: spacing.xs }}
      >
        <Text style={{ fontSize: 16 }}>🗑</Text>
      </Pressable>
    </Pressable>
  );
}
