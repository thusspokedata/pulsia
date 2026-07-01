import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { getBackendUrl, setBackendUrl } from "../src/storage/config";
import { testConnection } from "../src/api/health";
import { saveSettings } from "../src/api/settings";
import { colors, radius, spacing } from "../src/theme/tokens";

export default function ConfiguracionScreen() {
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    getBackendUrl().then((u) => {
      if (u) setUrl(u);
    });
  }, []);

  async function onSaveUrl() {
    await setBackendUrl(url);
    const ok = await testConnection(url);
    setStatus(ok ? "Conexión OK" : "No se pudo conectar");
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

      {status && <Text style={{ color: colors.accentText }}>{status}</Text>}
    </View>
  );
}
