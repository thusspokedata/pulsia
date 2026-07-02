import * as Crypto from "expo-crypto";

// UUID v4 (RFC 4122) para el id canónico de la sesión. El backend valida .uuid().
export function newSessionId(): string {
  return Crypto.randomUUID();
}
