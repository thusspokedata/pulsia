import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AgregarTomaScreen from "../app/nutricion/agregar-toma";
import { listSupplements, addAdHocTake } from "../src/api/supplements";

jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));
jest.mock("../src/api/supplements", () => ({
  listSupplements: jest.fn(async () => []),
  addAdHocTake: jest.fn(async () => {}),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (listSupplements as jest.Mock).mockResolvedValue([]);
  (addAdHocTake as jest.Mock).mockResolvedValue(undefined);
});

test("con stepper: arma dose '<n> <unitLabel>' y postea", async () => {
  (listSupplements as jest.Mock).mockResolvedValueOnce([
    { id: "s1", name: "Vitamina D", servingLabel: "1 cápsula", unitLabel: "cápsula", source: "label", info: "x", components: [], createdAt: 0 },
  ]);
  await render(<AgregarTomaScreen />);
  await waitFor(() => expect(screen.getByText("Vitamina D")).toBeTruthy());
  await fireEvent.press(screen.getByText("Vitamina D"));
  await fireEvent.press(screen.getByTestId("dose-stepper-inc")); // n=2
  await fireEvent.press(screen.getByText("Agregar"));
  await waitFor(() => expect(addAdHocTake).toHaveBeenCalled());
  expect(addAdHocTake).toHaveBeenCalledWith(
    "http://x",
    expect.objectContaining({ dose: "2 cápsula", supplementId: "s1", slot: "desayuno" }),
  );
});

test("sin unitLabel: cae a TextInput de dosis libre", async () => {
  (listSupplements as jest.Mock).mockResolvedValueOnce([
    { id: "s2", name: "Creatina", servingLabel: "5 g", unitLabel: null, source: "estimate", info: "x", components: [], createdAt: 0 },
  ]);
  await render(<AgregarTomaScreen />);
  await waitFor(() => expect(screen.getByText("Creatina")).toBeTruthy());
  await fireEvent.press(screen.getByText("Creatina"));
  const input = screen.getByTestId("dose-free");
  await fireEvent.changeText(input, "media pastilla");
  await fireEvent.press(screen.getByText("Agregar"));
  await waitFor(() => expect(addAdHocTake).toHaveBeenCalled());
  expect(addAdHocTake).toHaveBeenCalledWith(
    "http://x",
    expect.objectContaining({ dose: "media pastilla", supplementId: "s2", slot: "desayuno" }),
  );
});
