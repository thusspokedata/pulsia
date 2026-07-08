import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { getBackendUrl } from "../src/storage/config";
import { register } from "../src/api/auth";
import { useAuth } from "../src/auth/AuthContext";
import { colors, radius, spacing } from "../src/theme/tokens";

export default function RegistroScreen() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setLoading(true); setError(null);
    try {
      const url = await getBackendUrl();
      await register(url, email.trim(), password, invite.trim());
      await refresh();
      router.replace("/");
    } catch (e) {
      setError((e as Error).message || "No se pudo registrar");
    } finally {
      setLoading(false);
    }
  }

  const input = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.md, color: colors.text } as const;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.md, justifyContent: "center" }}>
      <Text style={{ fontSize: 22, fontWeight: "600", color: colors.text }}>Crear cuenta</Text>
      <TextInput testID="reg-email" style={input} placeholder="Email" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput testID="reg-password" style={input} placeholder="Contraseña (mín 8)" placeholderTextColor={colors.textMuted} secureTextEntry value={password} onChangeText={setPassword} />
      <TextInput testID="reg-invite" style={input} placeholder="Código de invitación" placeholderTextColor={colors.textMuted} autoCapitalize="none" value={invite} onChangeText={setInvite} />
      <Pressable testID="reg-submit" disabled={loading} onPress={onSubmit} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Registrarme</Text>}
      </Pressable>
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Pressable testID="go-login" onPress={() => router.replace("/login")} style={{ alignItems: "center", paddingVertical: spacing.sm }}>
        <Text style={{ color: colors.accentText }}>Ya tengo cuenta</Text>
      </Pressable>
    </View>
  );
}
