import { SyncError, syncErrorFromResponse, syncErrorFromThrown } from "../src/sync/errors";

test("SyncError.retryable es true para network y server, false para auth/validation/conflict", () => {
  expect(new SyncError("network").retryable).toBe(true);
  expect(new SyncError("server", 500).retryable).toBe(true);
  expect(new SyncError("auth", 401).retryable).toBe(false);
  expect(new SyncError("validation", 400).retryable).toBe(false);
  expect(new SyncError("conflict", 409).retryable).toBe(false);
});

test("SyncError expone un userMessage en lenguaje simple por kind", () => {
  expect(new SyncError("network").userMessage).toMatch(/conexión/i);
  expect(new SyncError("auth", 401).userMessage).toMatch(/sesión|vencida/i);
  expect(new SyncError("validation", 400).userMessage).toMatch(/dato/i);
  expect(new SyncError("server", 500).userMessage).toMatch(/servidor/i);
});

test("syncErrorFromResponse mapea el status al kind correcto", () => {
  expect(syncErrorFromResponse({ status: 401 } as Response).kind).toBe("auth");
  expect(syncErrorFromResponse({ status: 400 } as Response).kind).toBe("validation");
  expect(syncErrorFromResponse({ status: 409 } as Response).kind).toBe("conflict");
  expect(syncErrorFromResponse({ status: 503 } as Response).kind).toBe("server");
  expect(syncErrorFromResponse({ status: 418 } as Response).kind).toBe("unknown");
  // 429 (rate limit) y 408 (request timeout) son reintentables → kind server.
  expect(syncErrorFromResponse({ status: 429 } as Response).kind).toBe("server");
  expect(syncErrorFromResponse({ status: 429 } as Response).retryable).toBe(true);
  expect(syncErrorFromResponse({ status: 408 } as Response).kind).toBe("server");
  expect(syncErrorFromResponse({ status: 408 } as Response).retryable).toBe(true);
});

test("syncErrorFromThrown trata cualquier excepción como network (red caída/abort)", () => {
  expect(syncErrorFromThrown(new Error("Aborted")).kind).toBe("network");
});
