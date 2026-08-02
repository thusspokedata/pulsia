import { Alert } from "react-native";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WaterCard } from "../src/components/WaterCard";
import type { WaterLog } from "@pulsia/shared";

const water: WaterLog[] = [{ id: "w1", ml: 250, loggedAt: Date.now() } as WaterLog];
const liquid = { total: 900, drank: 700, fromFood: 200 };

beforeEach(async () => { await AsyncStorage.clear(); jest.restoreAllMocks(); });

test("muestra la meta (35 ml/kg) y el % de lo bebido", async () => {
  await render(<WaterCard water={water} liquid={liquid} weightKg={80} onAddWater={jest.fn()} onUndoLast={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("💧 Agua 700 / 2800 ml")).toBeTruthy());
  expect(screen.getByText("25%")).toBeTruthy();
});

test("+1 vaso llama onAddWater(250)", async () => {
  const onAddWater = jest.fn();
  await render(<WaterCard water={water} liquid={liquid} weightKg={80} onAddWater={onAddWater} onUndoLast={jest.fn()} />);
  await fireEvent.press(screen.getByTestId("water-add-glass"));
  expect(onAddWater).toHaveBeenCalledWith(250);
});

test("borrar el último pide confirmación y solo borra al confirmar", async () => {
  const onUndoLast = jest.fn();
  jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    const confirm = (buttons ?? []).find((b) => b.style === "destructive");
    confirm?.onPress?.();
  });
  await render(<WaterCard water={water} liquid={liquid} weightKg={80} onAddWater={jest.fn()} onUndoLast={onUndoLast} />);
  await fireEvent.press(screen.getByTestId("water-undo"));
  expect(Alert.alert).toHaveBeenCalled();
  expect(onUndoLast).toHaveBeenCalledTimes(1);
});

test("editar la meta guarda el override y lo refleja", async () => {
  await render(<WaterCard water={water} liquid={liquid} weightKg={80} onAddWater={jest.fn()} onUndoLast={jest.fn()} />);
  await fireEvent.press(screen.getByTestId("water-goal-edit"));
  await fireEvent.changeText(screen.getByTestId("water-goal-input"), "3000");
  await fireEvent.press(screen.getByTestId("water-goal-save"));
  await waitFor(() => expect(screen.getByText("💧 Agua 700 / 3000 ml")).toBeTruthy());
  expect(await AsyncStorage.getItem("pulsia.waterGoalOverrideMl")).toBe("3000");
});

test("'Auto' limpia el override y vuelve al cálculo por peso", async () => {
  await AsyncStorage.setItem("pulsia.waterGoalOverrideMl", "3000");
  await render(<WaterCard water={water} liquid={liquid} weightKg={80} onAddWater={jest.fn()} onUndoLast={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("💧 Agua 700 / 3000 ml")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("water-goal-edit"));
  await fireEvent.press(screen.getByTestId("water-goal-auto"));
  await waitFor(() => expect(screen.getByText("💧 Agua 700 / 2800 ml")).toBeTruthy());
  expect(await AsyncStorage.getItem("pulsia.waterGoalOverrideMl")).toBeNull();
});
