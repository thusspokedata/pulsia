import { render, screen, fireEvent } from "@testing-library/react-native";
import { useState } from "react";
import { WeekTabs } from "../src/components/WeekTabs";

function Harness() {
  const [w, setW] = useState(1);
  return <WeekTabs weeks={[1, 2, 3]} selected={w} onSelect={setW} />;
}

test("marca la semana seleccionada y permite cambiarla", async () => {
  await render(<Harness />);
  expect(screen.getByTestId("week-1").props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByText("Semana 3"));
  expect(screen.getByTestId("week-3").props.accessibilityState.selected).toBe(true);
});
