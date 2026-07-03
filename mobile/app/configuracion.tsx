import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { getBackendUrl, setBackendUrl } from "../src/storage/config";
import { testConnection } from "../src/api/health";
import { saveSettings } from "../src/api/settings";
import { getPairedBand, setPairedBand, clearPairedBand } from "../src/storage/pairedBand";
import { createBandManager, type BandManagerHandle, type FoundDevice } from "../src/ble/bandManager";
import { ensureBlePermissions } from "../src/ble/permissions";
import { colors, radius, spacing } from "../src/theme/tokens";

const SCAN_TIMEOUT_MS = 12_000;

export default function ConfiguracionScreen() {
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pairedName, setPairedName] = useState<string | null>(null);
  const [found, setFound] = useState<FoundDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const bandMgr = useRef<BandManagerHandle | null>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foundRef = useRef<FoundDevice[]>([]);

  function clearScanTimer() {
    if (scanTimer.current) {
      clearTimeout(scanTimer.current);
      scanTimer.current = null;
    }
  }

  useEffect(() => {
    getBackendUrl().then((u) => {
      if (u) setUrl(u);
    });
    getPairedBand().then((b) => setPairedName(b?.name ?? null));
    return () => {
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
      if (foundRef.current.length === 0) {
        bandMgr.current?.stopScan();
        setScanning(false);
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
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg }}>
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

      {status && <Text style={{ color: colors.accentText }}>{status}</Text>}
    </View>
  );
}
