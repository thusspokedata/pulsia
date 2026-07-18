import { useRef, useState, useEffect } from "react";
import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import type { MetricCsvPreview, MetricImportResult } from "@pulsia/shared";
import { parseGarminCsv, importGarminCsv, type GarminCsvKind } from "../src/api/metrics";
import { getBackendUrl } from "../src/storage/config";
import { colors, radius, spacing } from "../src/theme/tokens";
import { useScreenPadding } from "../src/theme/screen";
import { ChipGroup } from "../src/components/ChipGroup";

const KIND_OPTIONS: { value: GarminCsvKind; label: string }[] = [
  { value: "sleep", label: "Sueño" },
  { value: "weight", label: "Peso" },
  { value: "steps", label: "Pasos" },
];

function summarizeRow(kind: GarminCsvKind, row: MetricCsvPreview["rows"][number]): string {
  const find = (t: string) => row.entries.find((e) => e.metricType === t)?.value;
  if (kind === "sleep") {
    const score = find("sleep_score");
    const dur = find("sleep_hours");
    const parts = [score != null ? `score ${score}` : null, dur != null ? `${dur.toFixed(1)} h` : null].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "—";
  }
  if (kind === "weight") {
    const w = find("weight_kg");
    return w != null ? `${w.toFixed(1)} kg` : "—";
  }
  const steps = find("steps");
  const goal = find("steps_goal");
  const parts = [steps != null ? `${steps} pasos` : null, goal != null ? `objetivo ${goal}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

const KIND_INTRO: Record<GarminCsvKind, string> = {
  sleep:
    "Exportá el CSV de sueño desde Garmin Connect y elegilo acá. Se guardan puntaje, FC en reposo, Body Battery, Pulse Ox, respiración, HRV, duración y sueño necesario, una fila por noche.",
  weight:
    "Exportá el CSV de peso desde Garmin Connect y elegilo acá. Se guardan peso, grasa corporal, masa muscular, masa ósea y agua corporal; puede haber varias pesadas por día.",
  steps:
    "Exportá el CSV de pasos desde Garmin Connect y elegilo acá. Se guardan los pasos dados y el objetivo del día, una fila por día.",
};

export default function ImportarGarmin() {
  const router = useRouter();
  const baseUrl = useRef<string | null>(null);
  const screenPad = useScreenPadding(spacing.xl);
  const [kind, setKind] = useState<GarminCsvKind>("sleep");
  const [csvB64, setCsvB64] = useState<string | null>(null);
  const [preview, setPreview] = useState<MetricCsvPreview | null>(null);
  const [result, setResult] = useState<MetricImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBackendUrl().then((u) => {
      baseUrl.current = u;
    });
  }, []);

  function onChangeKind(next: GarminCsvKind) {
    setKind(next);
    // El preview/resultado cargado corresponde al tipo anterior: limpiar para no mostrar
    // datos de un CSV distinto bajo el tipo nuevo.
    setError(null);
    setResult(null);
    setPreview(null);
    setCsvB64(null);
  }

  async function onPick() {
    const url = baseUrl.current;
    if (!url) {
      setError("Configurá el backend");
      return;
    }
    setError(null);
    setResult(null);
    setPreview(null);
    setCsvB64(null);
    let picked;
    try {
      picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    } catch {
      setError("No se pudo abrir el selector de archivos");
      return;
    }
    if (picked.canceled || !picked.assets || picked.assets.length === 0) return;
    setBusy(true);
    try {
      const b64 = await FileSystem.readAsStringAsync(picked.assets[0].uri, { encoding: "base64" });
      const pv = await parseGarminCsv(url, kind, b64);
      setCsvB64(b64);
      setPreview(pv);
    } catch (e) {
      setError((e as Error).message || "No se pudo leer el CSV");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    const url = baseUrl.current;
    if (!url || !csvB64) return;
    setBusy(true);
    setError(null);
    try {
      const r = await importGarminCsv(url, kind, csvB64);
      setResult(r);
      setPreview(null);
      setCsvB64(null);
    } catch (e) {
      setError((e as Error).message || "No se pudo importar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.lg }}>
      <Pressable onPress={() => router.back()} style={{ paddingVertical: spacing.xs }}>
        <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>← Volver</Text>
      </Pressable>

      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>Importar datos de Garmin</Text>

      <ChipGroup single options={KIND_OPTIONS} selected={[kind]} onChange={(next) => onChangeKind(next[0] as GarminCsvKind)} />

      <Text style={{ color: colors.textMuted }}>{KIND_INTRO[kind]}</Text>

      <Pressable
        testID="garmin-pick"
        onPress={onPick}
        disabled={busy}
        style={{
          borderWidth: 1,
          borderColor: colors.accent,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          alignItems: "center",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy && !preview ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={{ color: colors.accentText, fontWeight: "600" }}>Elegir archivo CSV</Text>
        )}
      </Pressable>

      {error ? (
        <Text testID="garmin-error" style={{ color: colors.danger, fontSize: 12 }}>
          {error}
        </Text>
      ) : null}

      {preview ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>
            {preview.rows.length} fila{preview.rows.length === 1 ? "" : "s"} detectada{preview.rows.length === 1 ? "" : "s"}
            {preview.skipped.length > 0 ? ` · ${preview.skipped.length} fila(s) salteada(s)` : ""}
          </Text>
          {preview.rows.slice(0, 14).map((row, i) => (
            <View key={`${row.date}-${i}`} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text }}>{row.label ?? row.date}</Text>
              <Text style={{ color: colors.textMuted }}>{summarizeRow(kind, row)}</Text>
            </View>
          ))}
          <Pressable
            testID="garmin-confirm"
            onPress={onConfirm}
            disabled={busy}
            style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: busy ? 0.6 : 1 }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>{busy ? "Importando…" : "Importar"}</Text>
          </Pressable>
        </View>
      ) : null}

      {result ? (
        <View style={{ gap: spacing.sm }}>
          <Text testID="garmin-result" style={{ color: colors.text, fontWeight: "600" }}>
            {result.imported} importada(s){result.duplicates > 0 ? ` · ${result.duplicates} ya estaban` : ""}.
          </Text>
          <Pressable
            testID="garmin-done"
            onPress={() => router.back()}
            style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Listo</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}
