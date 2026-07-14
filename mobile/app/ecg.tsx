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
import { useScreenPadding } from "../src/theme/screen";

const POLL_MS = 3000;
// Cota superior del poll: ~2 min (40 intentos × 3s). Evita pollear para siempre
// si el backend nunca resuelve el análisis.
const MAX_POLL_ATTEMPTS = 40;
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
  const screenPad = useScreenPadding(spacing.xl);
  const [recordings, setRecordings] = useState<EcgRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [pdfNote, setPdfNote] = useState<string | null>(null);
  const baseUrl = useRef<string | null>(null);
  // Evita solapar requests del poll si uno todavía está en vuelo.
  const inFlight = useRef(false);

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
      try {
        const url = await getBackendUrl();
        if (!active) return;
        baseUrl.current = url;
        if (!url) {
          setListError("Configurá el backend");
          return;
        }
        await loadList(url);
      } catch {
        // Si algo falla antes de cargar la lista, no dejamos la pantalla trabada
        // en "Cargando…".
        if (active) setListError("No se pudieron cargar los ECG.");
      } finally {
        if (active) setLoading(false);
      }
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
    let attempts = 0;
    inFlight.current = false;
    const timer = setInterval(async () => {
      // Guard de solapamiento: si un request sigue en vuelo, salteamos este tick.
      if (inFlight.current) return;
      if (attempts >= MAX_POLL_ATTEMPTS) {
        clearInterval(timer);
        if (active) {
          setAnalyzeError("El análisis está tardando; volvé a entrar más tarde.");
          setAnalyzingId(null);
        }
        return;
      }
      attempts += 1;
      inFlight.current = true;
      let rec: EcgRecording;
      try {
        rec = await getEcg(url, analyzingId);
      } catch {
        // Blip transitorio: seguimos polleando el mismo id.
        return;
      } finally {
        inFlight.current = false;
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
    let base64: string;
    try {
      base64 = await FileSystem.readAsStringAsync(picked.assets[0].uri, { encoding: "base64" });
    } catch {
      setAnalyzeError("No se pudo leer el archivo seleccionado.");
      return;
    }
    try {
      const { id } = await uploadEcg(url, base64);
      setAnalyzingId(id);
    } catch (e) {
      // Mostramos el motivo real (mensaje del backend, timeout o error de red) en vez de un
      // texto genérico, para que el usuario sepa qué pasó y se pueda diagnosticar.
      const err = e as Error;
      setAnalyzeError(
        err.name === "AbortError"
          ? "La subida tardó demasiado. Revisá tu conexión y reintentá."
          : err.message || "No se pudo subir el ECG. Reintentá.",
      );
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
      const result = await FileSystem.downloadAsync(ecgPdfUrl(url, id), dest, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      // Si el status no es 200, el archivo descargado es un cuerpo de error, no un PDF:
      // no lo compartimos. 422 = PDF protegido; el resto, error genérico.
      if (result.status !== 200) {
        setPdfNote(
          result.status === 422
            ? "No se pudo obtener el PDF (¿está protegido? Revisá tu contraseña de Kardia)."
            : "No se pudo obtener el PDF.",
        );
        return;
      }
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
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.lg }}>
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
                  {rec.status === "done" && rec.analysis ? (
                    <>
                      <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: "700" }}>
                        {rec.analysis.kardiaVerdict}
                      </Text>
                      <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={expanded ? undefined : 2}>
                        {rec.analysis.interpretation}
                      </Text>
                    </>
                  ) : rec.status === "pending" ? (
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>Analizando…</Text>
                  ) : rec.status === "failed" ? (
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>El análisis falló</Text>
                  ) : (
                    // done sin análisis (o cualquier estado inesperado): fallback neutral.
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>Sin datos de análisis.</Text>
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
