import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Linking } from "react-native";
import { router } from "expo-router";
import { getBackendUrl, setBackendUrl } from "../src/storage/config";
import { logout } from "../src/api/auth";
import { useAuth } from "../src/auth/AuthContext";
import { testConnection } from "../src/api/health";
import { saveSettings, getSettings } from "../src/api/settings";
import { scheduleDailyReport, cancelDailyReport, getReminderTime, DEFAULT_TIME } from "../src/reports/reminder";
import { getPairedBand, setPairedBand, clearPairedBand } from "../src/storage/pairedBand";
import { getSoundsEnabled, setSoundsEnabled } from "../src/storage/sounds";
import { createBandManager, type BandManagerHandle, type FoundDevice } from "../src/ble/bandManager";
import { ensureBlePermissions } from "../src/ble/permissions";
import { colors, radius, spacing } from "../src/theme/tokens";

const SCAN_TIMEOUT_MS = 12_000;

export default function ConfiguracionScreen() {
  const { signOut } = useAuth();
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pairedName, setPairedName] = useState<string | null>(null);
  const [found, setFound] = useState<FoundDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [soundsEnabled, setSoundsEnabledState] = useState(true);
  const [ecgEnabled, setEcgEnabled] = useState(false);
  const [kardiaPw, setKardiaPw] = useState("");
  const [reportsEnabled, setReportsEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState(DEFAULT_TIME);
  const bandMgr = useRef<BandManagerHandle | null>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foundRef = useRef<FoundDevice[]>([]);
  // Evita que la hidratación tardía de getSettings pise un toggle que el usuario
  // ya tocó (y evita setState tras desmontar).
  const ecgTouched = useRef(false);
  const reportsTouched = useRef(false);
  const mounted = useRef(true);

  function clearScanTimer() {
    if (scanTimer.current) {
      clearTimeout(scanTimer.current);
      scanTimer.current = null;
    }
  }

  useEffect(() => {
    getBackendUrl().then((u) => {
      if (u) setUrl(u);
      getSettings(u ?? "")
        .then((s) => {
          // No pisar un toggle que el usuario ya tocó, ni actualizar tras desmontar.
          if (!mounted.current || ecgTouched.current) return;
          setEcgEnabled(s.ecgEnabled);
          if (!reportsTouched.current) setReportsEnabled(s.reportsEnabled);
        })
        .catch(() => { /* best-effort: si falla, ECG queda desactivado */ });
    });
    getPairedBand().then((b) => setPairedName(b?.name ?? null));
    getSoundsEnabled().then(setSoundsEnabledState);
    getReminderTime().then((t) => {
      if (mounted.current) setReminderTime(t);
    });
    return () => {
      mounted.current = false;
      clearScanTimer();
      bandMgr.current?.destroy();
      bandMgr.current = null;
    };
  }, []);

  async function onSaveUrl() {
    try {
      await setBackendUrl(url);
      const ok = await testConnection(url);
      setStatus(ok ? "Conexión OK" : "No se pudo conectar");
    } catch {
      setStatus("Error al guardar la URL");
    }
  }

  async function onSaveKey() {
    try {
      await saveSettings(url, { aiApiKey: apiKey, aiModel: "claude-sonnet-4-6" });
      setApiKey("");
      setStatus("API key guardada");
    } catch {
      setStatus("Error al guardar la API key");
    }
  }

  async function onScanBand() {
    setScanMsg(null);
    const ok = await ensureBlePermissions();
    if (!ok) {
      setScanError("Faltan permisos de Bluetooth. Activalos en Ajustes.");
      return;
    }
    setFound([]);
    foundRef.current = [];
    setScanning(true);
    if (!bandMgr.current) bandMgr.current = createBandManager();
    // Guarda contra re-escaneo apilado: detener cualquier escaneo previo antes de arrancar.
    bandMgr.current.stopScan();
    bandMgr.current.scan((d) => {
      setFound((prev) => {
        const next = prev.some((x) => x.id === d.id) ? prev : [...prev, d];
        foundRef.current = next;
        return next;
      });
    });
    clearScanTimer();
    scanTimer.current = setTimeout(() => {
      scanTimer.current = null;
      // Siempre detenemos el escaneo y limpiamos el estado al vencer el timeout.
      bandMgr.current?.stopScan();
      setScanning(false);
      if (foundRef.current.length === 0) {
        setScanMsg("No se encontró ninguna banda. Encendela y cerrá la app de Polar/Garmin.");
      }
    }, SCAN_TIMEOUT_MS);
  }

  function setScanError(msg: string) {
    setScanning(false);
    setScanMsg(msg);
  }

  async function onPickBand(d: FoundDevice) {
    clearScanTimer();
    bandMgr.current?.stopScan();
    setScanning(false);
    setScanMsg(null);
    await setPairedBand({ deviceId: d.id, name: d.name });
    setPairedName(d.name);
    setFound([]);
    foundRef.current = [];
  }

  async function onForgetBand() {
    await clearPairedBand();
    setPairedName(null);
  }

  async function onLogout() {
    try {
      const url = await getBackendUrl();
      await logout(url);
    } catch { /* best-effort: cerramos sesión local igual */ }
    await signOut();
    router.replace("/login");
  }

  async function onToggleSounds() {
    const next = !soundsEnabled;
    setSoundsEnabledState(next);
    try {
      await setSoundsEnabled(next);
    } catch {
      // Rollback UI para no desincronizar UI↔storage si la escritura falla.
      setSoundsEnabledState(!next);
    }
  }

  async function onToggleEcg() {
    ecgTouched.current = true;
    const next = !ecgEnabled;
    setEcgEnabled(next);
    try {
      await saveSettings(url, { ecgEnabled: next });
    } catch {
      // Rollback UI para no desincronizar UI↔backend si la escritura falla.
      setEcgEnabled(!next);
    }
  }

  async function onToggleReports() {
    reportsTouched.current = true;
    const next = !reportsEnabled;
    setReportsEnabled(next);
    try {
      await saveSettings(url, { reportsEnabled: next });
      if (next) {
        await scheduleDailyReport(await getReminderTime());
      } else {
        await cancelDailyReport();
      }
    } catch {
      // Rollback UI para no desincronizar UI↔backend si la escritura falla.
      setReportsEnabled(!next);
    }
  }

  async function onChangeReminderTime(text: string) {
    setReminderTime(text);
    if (/^\d{1,2}:\d{2}$/.test(text)) {
      await scheduleDailyReport(text);
    }
  }

  async function onSaveKardiaPw() {
    // No trimear: la contraseña del PDF puede tener espacios al inicio/fin y
    // debe guardarse exactamente como el usuario la tipeó.
    if (kardiaPw.length === 0) return;
    try {
      await saveSettings(url, { kardiaPdfPassword: kardiaPw });
      setStatus("Contraseña de Kardia guardada");
    } catch {
      setStatus("Error al guardar la contraseña de Kardia");
    }
  }

  const input = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    color: colors.text,
    backgroundColor: colors.bg,
  } as const;
  const button = {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    padding: spacing.md,
    alignItems: "center",
  } as const;

  return (
    <ScrollView
      testID="configuracion-scroll"
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xl * 2, gap: spacing.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>URL del backend</Text>
        <TextInput
          style={input}
          placeholder="http://192.168.1.50:8787"
          autoCapitalize="none"
          value={url}
          onChangeText={setUrl}
        />
        <Pressable style={button} onPress={onSaveUrl}>
          <Text style={{ color: "#fff" }}>Guardar URL</Text>
        </Pressable>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>API key de IA</Text>
        <TextInput
          style={input}
          placeholder="sk-ant-..."
          autoCapitalize="none"
          secureTextEntry
          value={apiKey}
          onChangeText={setApiKey}
        />
        <Pressable style={button} onPress={onSaveKey}>
          <Text style={{ color: "#fff" }}>Guardar API key</Text>
        </Pressable>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>Banda de pulso</Text>
        <Text style={{ color: colors.text }}>{pairedName ? `${pairedName} (emparejada)` : "Ninguna"}</Text>
        <Pressable style={button} onPress={onScanBand}>
          <Text style={{ color: "#fff" }}>Escanear banda</Text>
        </Pressable>
        {scanning && <Text style={{ color: colors.textMuted, fontSize: 12 }}>Buscando…</Text>}
        {scanMsg && <Text style={{ color: colors.textMuted, fontSize: 12 }}>{scanMsg}</Text>}
        {found.map((d) => (
          <Pressable
            key={d.id}
            testID={`band-${d.id}`}
            onPress={() => onPickBand(d)}
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.md }}
          >
            <Text style={{ color: colors.text }}>{d.name}</Text>
          </Pressable>
        ))}
        {pairedName && (
          <Pressable onPress={onForgetBand} style={{ alignItems: "center" }}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Olvidar banda</Text>
          </Pressable>
        )}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>Sonidos</Text>
        <Pressable
          testID="sounds-toggle"
          onPress={onToggleSounds}
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.md }}
        >
          <Text style={{ color: colors.text }}>Campana al terminar el descanso</Text>
          <Text style={{ color: soundsEnabled ? colors.accentText : colors.textMuted }}>
            {soundsEnabled ? "Activados" : "Desactivados"}
          </Text>
        </Pressable>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>ECG / Corazón</Text>
        <Pressable
          testID="ecg-toggle"
          onPress={onToggleEcg}
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.md }}
        >
          <Text style={{ color: colors.text }}>Registrar y analizar ECG</Text>
          <Text style={{ color: ecgEnabled ? colors.accentText : colors.textMuted }}>
            {ecgEnabled ? "Activado" : "Desactivado"}
          </Text>
        </Pressable>
        {ecgEnabled && (
          <>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Si tus PDFs de Kardia tienen contraseña, guardala acá para poder abrirlos.
            </Text>
            <TextInput
              testID="kardia-password"
              style={input}
              placeholder="Contraseña del PDF de Kardia (opcional)"
              autoCapitalize="none"
              secureTextEntry
              value={kardiaPw}
              onChangeText={setKardiaPw}
              onSubmitEditing={onSaveKardiaPw}
              onBlur={onSaveKardiaPw}
            />
            <Pressable testID="ecg-screen-link" onPress={() => router.push("/ecg")} style={button}>
              <Text style={{ color: "#fff" }}>Ver mis ECG</Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>Informes del agente</Text>
        <Pressable
          testID="reports-toggle"
          onPress={onToggleReports}
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.md }}
        >
          <Text style={{ color: colors.text }}>Recibir informes diarios del agente</Text>
          <Text style={{ color: reportsEnabled ? colors.accentText : colors.textMuted }}>
            {reportsEnabled ? "Activado" : "Desactivado"}
          </Text>
        </Pressable>
        {reportsEnabled && (
          <>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Recordatorio diario a las {reminderTime}
            </Text>
            <TextInput
              testID="reports-reminder-time"
              style={input}
              placeholder="HH:MM"
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              value={reminderTime}
              onChangeText={onChangeReminderTime}
            />
          </>
        )}
      </View>

      {status && <Text style={{ color: colors.accentText }}>{status}</Text>}

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs }}>
        <Text style={{ color: colors.text, fontWeight: "500" }}>Créditos</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Ilustraciones de ejercicios por Everkinetic (Greg Priday), bajo licencia Creative Commons
          Attribution-ShareAlike 4.0 International (CC BY-SA 4.0). Se usan sin modificar.
        </Text>
        <Pressable onPress={() => Linking.openURL("https://creativecommons.org/licenses/by-sa/4.0/")}>
          <Text style={{ color: colors.accent, fontSize: 12 }}>Ver la licencia</Text>
        </Pressable>
      </View>

      <Pressable testID="logout" onPress={onLogout} style={{ alignItems: "center", paddingVertical: spacing.md, marginTop: spacing.lg }}>
        <Text style={{ color: colors.danger, fontWeight: "600" }}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}
