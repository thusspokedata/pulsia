import { testConnection } from "./health";
import { saveSettings, getSettings } from "./settings";
import { apiFetch } from "./client";

jest.mock("../storage/authToken", () => ({ getToken: jest.fn(async () => "tok-123") }));

const URL = "http://backend.test";

afterEach(() => {
  (global.fetch as any) = undefined;
});

test("testConnection true cuando /health responde ok", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) }) as any;
  expect(await testConnection(URL)).toBe(true);
});

test("testConnection false cuando falla la red", async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error("network")) as any;
  expect(await testConnection(URL)).toBe(false);
});

test("saveSettings hace POST /settings con la api key", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  global.fetch = fetchMock as any;
  await saveSettings(URL, { aiApiKey: "sk-ant-x", aiModel: "claude-sonnet-4-6" });
  expect(fetchMock).toHaveBeenCalledWith(
    "http://backend.test/settings",
    expect.objectContaining({ method: "POST" }),
  );
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.aiApiKey).toBe("sk-ant-x");
});

test("getSettings devuelve hasApiKey", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ hasApiKey: true, aiModel: "claude-sonnet-4-6" }) }) as any;
  expect(await getSettings(URL)).toEqual({ hasApiKey: true, aiModel: "claude-sonnet-4-6" });
});

test("apiFetch adjunta Authorization Bearer cuando hay token", async () => {
  const fetchMock = jest.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  global.fetch = fetchMock as any;
  await apiFetch("http://b.test", "/x");
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  expect((init.headers as any).Authorization).toBe("Bearer tok-123");
});
