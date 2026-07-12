import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { EcgRecording } from "@pulsia/shared";
import { uploadEcg, listEcg, getEcg, deleteEcg, ecgPdfUrl } from "../src/api/ecg";
import { getBackendUrl } from "../src/storage/config";
import { getToken } from "../src/storage/authToken";
import { colors, radius, spacing } from "../src/theme/tokens";

const POLL_MS = 3000;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtDate(rec: EcgRecording): string {
  // Preferimos la fecha real de la lectura (recordedAt); si no hay, la de subida.
  const d = rec.analysis?.recordedAt ? new Date(rec.analysis.recordedAt) : new Date(rec.createdAt);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function sortByDate(list: EcgRecording[]): EcgRecording[] {
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

export default function EcgScreen() {
  const [recordings, setRecordings] = useState<EcgRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [pdfNote, setPdfNote] = useState<string | null>(null);
  const baseUrl = useRef<string | null>(null);

  async function loadList(url: string) {
    try {
      const list = await listEcg(url);
      setRecordings(sortByDate(list));
      setListError(null);
    } catch {
      setListError("No se pudieron cargar los registros");
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const url = await getBackendUrl();
      if (!active) return;
      baseUrl.current = url;
      if (!url) {
        setListError("Configurá el backend");
        setLoading(false);
        return;
      }
      await loadList(url);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Poll del registro en análisis: cada 3s hasta que deja de estar "pending".
  useEffect(() => {
    if (!analyzingId) return;
    const url = baseUrl.current;
    if (!url) return;
    let active = true;
    const timer = setInterval(async () => {
      let rec: EcgRecording;
      try {
        rec = await getEcg(url, analyzingId);
      } catch {
        // Blip transitorio: seguimos polleando el mismo id.
        return;
      }
      if (!active || rec.status === "pending") return;
      clearInterval(timer);
      if (rec.status === "failed") setAnalyzeError(rec.error ?? "El análisis falló. Reintentá.");
      await loadList(url);
      if (active) setAnalyzingId(null);
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [analyzingId]);

  async function onUpload() {
    const url = baseUrl.current;
    if (!url) return;
    setAnalyzeError(null);
    setPdfNote(null);
    let picked;
    try {
      picked = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    } catch {
      setAnalyzeError("No se pudo abrir el selector de archivos");
      return;
    }
    if (picked.canceled || !picked.assets || picked.assets.length === 0) return;
    try {
      const base64 = await FileSystem.readAsStringAsync(picked.assets[0].uri, { encoding: "base64" });
      const { id } = await uploadEcg(url, base64);
      setAnalyzingId(id);
    } catch {
      setAnalyzeError("No se pudo subir el ECG. Reintentá.");
    }
  }

  async function onViewPdf(id: string) {
    const url = baseUrl.current;
    if (!url) return;
    setPdfNote(null);
    try {
      const token = await getToken();
      const dest = `${FileSystem.cacheDirectory ?? ""}ecg-${id}.pdf`;
      // El endpoint del PDF exige el Bearer token; downloadAsync permite mandar headers.
      await FileSystem.downloadAsync(ecgPdfUrl(url, id), dest, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      // Abrir con el share-sheet del sistema (deja elegir un visor de PDF). Fallback: avisar
      // que quedó descargado si el dispositivo no tiene share disponible.
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      } else {
        setPdfNote("PDF descargado en el dispositivo.");
      }
    } catch {
      setPdfNote("No se pudo descargar el PDF.");
    }
  }

  function confirmDelete(rec: EcgRecording) {
    Alert.alert("Eliminar ECG", "Se borrará este registro de la base de datos. ¿Seguro?", [
      { text: "No", style: "cancel" },
      { text: "Sí, eliminar", style: "destructive", onPress: () => onDelete(rec) },
    ]);
  }

  async function onDelete(rec: EcgRecording) {
    const url = baseUrl.current;
    if (!url) return;
    try {
      await deleteEcg(url, rec.id);
      setRecordings((prev) => prev.filter((r) => r.id !== rec.id));
      if (expandedId === rec.id) setExpandedId(null);
    } catch {
      setListError("No se pudo eliminar el registro");
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>ECG (KardiaMobile)</Text>

      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
        ⚠️ Esto no reemplaza la evaluación de un médico. Ante hallazgos preocupantes, consultá a un profesional.
      </Text>

      <Pressable
        testID="upload-ecg"
        onPress={onUpload}
        disabled={!!analyzingId}
        style={{
          backgroundColor: colors.accent,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          alignItems: "center",
          opacity: analyzingId ? 0.6 : 1,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "600" }}>Subir ECG</Text>
      </Pressable>

      {analyzingId && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Analizando…</Text>
        </View>
      )}
      {analyzeError && <Text style={{ color: colors.danger, fontSize: 12 }}>{analyzeError}</Text>}
      {pdfNote && <Text style={{ color: colors.textMuted, fontSize: 12 }}>{pdfNote}</Text>}
      {listError && <Text style={{ color: colors.danger, fontSize: 12 }}>{listError}</Text>}

      {loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : recordings.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>Todavía no hay registros de ECG</Text>
      ) : (
        recordings.map((rec) => {
          const expanded = expandedId === rec.id;
          return (
            <View
              key={rec.id}
              style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}
            >
              <Pressable
                testID={`ecg-item-${rec.id}`}
                onPress={() => setExpandedId(expanded ? null : rec.id)}
                style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{fmtDate(rec)}</Text>
                  {rec.analysis ? (
                    <>
                      <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: "700" }}>
                        {rec.analysis.kardiaVerdict}
                      </Text>
                      <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={expanded ? undefined : 2}>
                        {rec.analysis.interpretation}
                      </Text>
                    </>
                  ) : (
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                      {rec.status === "failed" ? "El análisis falló" : "Analizando…"}
                    </Text>
                  )}
                </View>
                <Pressable
                  testID={`ecg-del-${rec.id}`}
                  onPress={() => confirmDelete(rec)}
                  hitSlop={8}
                  style={{ paddingHorizontal: spacing.xs, paddingVertical: spacing.xs }}
                >
                  <Text style={{ fontSize: 16 }}>🗑</Text>
                </Pressable>
              </Pressable>

              {expanded && rec.analysis && (
                <View style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
                  {rec.analysis.avgHeartRate != null && (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      FC promedio: {rec.analysis.avgHeartRate} lpm
                    </Text>
                  )}
                  <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{rec.analysis.interpretation}</Text>
                  <Pressable
                    testID={`ecg-pdf-${rec.id}`}
                    onPress={() => onViewPdf(rec.id)}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.accent,
                      borderRadius: radius.sm,
                      paddingVertical: spacing.sm,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: colors.accentText, fontWeight: "600" }}>Ver PDF</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
