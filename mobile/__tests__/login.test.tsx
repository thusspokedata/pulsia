import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import LoginScreen from "../app/login";
import { login } from "../src/api/auth";

jest.mock("expo-router", () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://b.test" }));
jest.mock("../src/api/auth", () => ({ login: jest.fn(async () => {}) }));
jest.mock("../src/auth/AuthContext", () => ({ useAuth: () => ({ refresh: jest.fn(async () => {}) }) }));

test("login llama al api y refresca la sesión", async () => {
  await render(<LoginScreen />);
  await fireEvent.changeText(screen.getByTestId("login-email"), "a@b.com");
  await fireEvent.changeText(screen.getByTestId("login-password"), "secret123");
  await fireEvent.press(screen.getByTestId("login-submit"));
  await waitFor(() => expect(login).toHaveBeenCalledWith("http://b.test", "a@b.com", "secret123"));
});
