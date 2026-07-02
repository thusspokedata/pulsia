const mockRandomUUID = jest.fn(() => "11111111-1111-4111-8111-111111111111");
jest.mock("expo-crypto", () => ({ randomUUID: () => mockRandomUUID() }));

import { newSessionId } from "../src/session/id";

test("newSessionId delega en expo-crypto randomUUID", () => {
  expect(newSessionId()).toBe("11111111-1111-4111-8111-111111111111");
  expect(mockRandomUUID).toHaveBeenCalled();
});
