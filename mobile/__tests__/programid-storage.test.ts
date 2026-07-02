import AsyncStorage from "@react-native-async-storage/async-storage";
import { getStoredProgramId, setStoredProgramId } from "../src/storage/programId";

beforeEach(async () => { await AsyncStorage.clear(); });

test("programId: set/get", async () => {
  expect(await getStoredProgramId()).toBeNull();
  await setStoredProgramId("22222222-2222-4222-8222-222222222222");
  expect(await getStoredProgramId()).toBe("22222222-2222-4222-8222-222222222222");
});
