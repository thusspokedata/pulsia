import { useRef, useState, useEffect } from "react";
import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import type { SleepCsvPreview, SleepImportResult } from "@pulsia/shared";
import { parseSleepCsv, importSleepCsv } from "../src/api/metrics";
import { getBackendUrl } from "../src/storage/config";
import { colors, radius, spacing } from "../src/theme/tokens";
import { useScreenPadding } from "../src/theme/screen";

export default function ImportarSueno() {
  const router = useRouter();
  const baseUrl = useRef<string | null>(null);
  const screenPad = useScreenPadding(spacing.xl);
  const [csvB64, setCsvB64] = useState<string | null>(null);
  const [preview, setPreview] = useState<SleepCsvPreview | null>(null);
  const [result, setResult] = useState<SleepImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBackendUrl().then((u) => {
      baseUrl.current = u;
    });
  }, []);

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
      const pv = await parseSleepCsv(url, b64);
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
      const r = await importSleepCsv(url, csvB64);
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

      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>Importar sueño de Garmin</Text>
      <Text style={{ color: colors.textMuted }}>
        Exportá el CSV de sueño desde Garmin Connect y elegilo acá. Se guardan puntaje, FC en reposo,
        Body Battery, Pulse Ox, respiración, HRV, duración y sueño necesario, una fila por noche.
      </Text>

      <Pressable
        testID="sleep-pick"
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
        <Text testID="sleep-error" style={{ color: colors.danger, fontSize: 12 }}>
          {error}
        </Text>
      ) : null}

      {preview ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>
            {preview.rows.length} noche{preview.rows.length === 1 ? "" : "s"} detectada{preview.rows.length === 1 ? "" : "s"}
            {preview.skipped.length > 0 ? ` · ${preview.skipped.length} fila(s) salteada(s)` : ""}
          </Text>
          {preview.rows.slice(0, 14).map((row) => {
            const score = row.entries.find((e) => e.metricType === "sleep_score")?.value;
            const dur = row.entries.find((e) => e.metricType === "sleep_hours")?.value;
            return (
              <View key={row.date} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.text }}>{row.date}</Text>
                <Text style={{ color: colors.textMuted }}>
                  {score != null ? `score ${score}` : "—"}
                  {dur != null ? ` · ${dur.toFixed(1)} h` : ""}
                </Text>
              </View>
            );
          })}
          <Pressable
            testID="sleep-confirm"
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
          <Text testID="sleep-result" style={{ color: colors.text, fontWeight: "600" }}>
            {result.imported} medición(es) importada(s){result.duplicates > 0 ? ` · ${result.duplicates} ya estaban` : ""}.
          </Text>
          <Pressable
            testID="sleep-done"
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
