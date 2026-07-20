import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CARDIO_LABELS, type CardioActivity } from "@pulsia/shared";
import { getCardioById } from "../src/api/cardio";
import { getBackendUrl } from "../src/storage/config";
import { CHANNELS, channelPoints } from "../src/cardio/cardioSeries";
import { buildTiles, athleteLines } from "../src/cardio/activityFormat";
import { StatTile } from "../src/components/StatTile";
import { HrZoneBar } from "../src/components/HrZoneBar";
import { LineChart } from "../src/components/LineChart";
import { colors, radius, spacing } from "../src/theme/tokens";
import { useScreenPadding } from "../src/theme/screen";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Los dos arrays del .FIT NO están alineados índice a índice, y confundirlos corre todos los
// rangos un escalón:
//   secondsPerZone = [<por debajo de Z1>, Z1, Z2, Z3, Z4, Z5, <por encima>]   (zonas + 2)
//   highBoundary   = [techo de Z1, …, techo de Z5, FC máx]                    (zonas + 1)
// Entonces la zona n (1-based) usa secondsPerZone[n], y va de highBoundary[n-2] (o 0 para Z1)
// hasta highBoundary[n-1].
export function buildZoneRows(secondsPerZone: number[], highBoundary: number[]) {
  const zoneCount = Math.min(highBoundary.length - 1, secondsPerZone.length - 1);
  const rows = [];
  for (let n = 1; n <= zoneCount; n++) {
    rows.push({
      name: `Z${n}`,
      range: `${highBoundary[n - 2] ?? 0}–${highBoundary[n - 1]} ppm`,
      seconds: secondsPerZone[n] ?? 0,
    });
  }
  return rows;
}

export default function ActividadScreen() {
  const screenPad = useScreenPadding(spacing.xl);
  const { id } = useLocalSearchParams<{ id: string }>();
  const baseUrl = useRef<string | null>(null);
  const [activity, setActivity] = useState<CardioActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const url = await getBackendUrl();
      if (!active) return;
      baseUrl.current = url;
      if (!url) {
        setError("Configurá el backend");
        setLoading(false);
        return;
      }
      try {
        const a = await getCardioById(url, id);
        if (!active) return;
        setActivity(a);
      } catch {
        if (active) setError("No se pudo cargar la actividad");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.lg }}>
        <ActivityIndicator color={colors.accent} />
      </ScrollView>
    );
  }

  if (error || !activity) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.lg }}>
        <Text style={{ color: colors.danger }}>{error ?? "No se pudo cargar la actividad"}</Text>
      </ScrollView>
    );
  }

  const a = activity;
  const tiles = buildTiles(a);
  const zones = a.fitExtras?.zones;
  const zoneRows = zones ? buildZoneRows(zones.secondsPerZone, zones.highBoundary) : [];
  const maxZoneSeconds = zoneRows.length > 0 ? Math.max(...zoneRows.map((z) => z.seconds)) : 0;
  const showZones = zoneRows.length > 0 && maxZoneSeconds > 0;

  const devices = a.fitExtras?.devices ?? [];
  const watch = devices.find((d) => d.garminProduct != null);
  const strap = devices.find((d) => d.antplusDeviceType === "heartRate");
  const strapBattery =
    strap && strap.batteryLevel != null
      ? typeof strap.batteryLevel === "number"
        ? `${strap.batteryLevel}%`
        : String(strap.batteryLevel)
      : null;
  const lines = athleteLines(a.fitExtras?.athlete);
  const sampleCount = a.samples?.t.length ?? 0;
  const hasTechnical = watch != null || strap != null || lines.length > 0 || sampleCount > 0 || a.distanceM != null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.lg }}>
      <Pressable onPress={() => router.back()} style={{ paddingVertical: spacing.xs }}>
        <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>← Volver</Text>
      </Pressable>

      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>
          {CARDIO_LABELS[a.type]} · {fmtDate(a.startedAt)}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          {hhmm(a.startedAt)}–{hhmm(a.startedAt + a.durationMs)}
        </Text>
        {a.sportProfileName ? <Text style={{ color: colors.textMuted, fontSize: 13 }}>{a.sportProfileName}</Text> : null}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {tiles.map((t) => (
          <StatTile key={t.label} label={t.label} value={t.value} unit={t.unit} />
        ))}
      </View>

      {CHANNELS.map((c) => {
        const pts = channelPoints(a, c.key);
        if (pts.length === 0) return null;
        return (
          <View key={c.key} style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>{c.label}</Text>
            <LineChart data={pts} unit={c.unit} />
            {c.key === "bodyBattery" ? (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Campo sin nombre en el .FIT (143); el patrón coincide con Body Battery.
              </Text>
            ) : null}
          </View>
        );
      })}

      {showZones ? (
        <View style={{ gap: spacing.md }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>Tiempo en zonas</Text>
          {zoneRows.map((z) => (
            <HrZoneBar key={z.name} name={z.name} range={z.range} seconds={z.seconds} maxSeconds={maxZoneSeconds} />
          ))}
        </View>
      ) : null}

      {hasTechnical ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>Detalles técnicos</Text>
          {watch ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Reloj: producto {String(watch.garminProduct)}</Text>
          ) : null}
          {strap ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Sensor de FC{strapBattery ? ` · batería ${strapBattery}` : ""}
            </Text>
          ) : null}
          {lines.map((l) => (
            <Text key={l.label} style={{ color: colors.textMuted, fontSize: 13 }}>
              {l.label}: {l.value}
            </Text>
          ))}
          {sampleCount > 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Muestras: {sampleCount}</Text>
          ) : null}
          {a.distanceM != null ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Distancia: {(a.distanceM / 1000).toFixed(2)} km</Text>
          ) : null}
        </View>
      ) : null}

      <Pressable
        testID="actividad-editar"
        onPress={() => router.push(`/cardio?id=${id}`)}
        style={{
          borderWidth: 1,
          borderColor: colors.accent,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          alignItems: "center",
        }}
      >
        <Text style={{ color: colors.accentText, fontWeight: "600" }}>Editar</Text>
      </Pressable>
    </ScrollView>
  );
}
