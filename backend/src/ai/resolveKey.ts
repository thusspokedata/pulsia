import { decryptSecret } from "../crypto/secrets";

// La key del usuario (encriptada en `settings`) tiene prioridad; si no hay, se usa la key
// por defecto del server (`config.defaultAiApiKey`). Null si no hay ninguna → el caller hace 400.
export function resolveAiKey(
  row: { aiApiKeyEncrypted?: string | null } | null | undefined,
  config: { encryptionKey: string; defaultAiApiKey?: string },
): string | null {
  if (row?.aiApiKeyEncrypted) return decryptSecret(row.aiApiKeyEncrypted, config.encryptionKey);
  return config.defaultAiApiKey ?? null;
}
