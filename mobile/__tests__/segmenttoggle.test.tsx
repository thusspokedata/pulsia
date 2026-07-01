import { render, screen, fireEvent } from "@testing-library/react-native";
import { useState } from "react";
import { SegmentToggle } from "../src/components/SegmentToggle";

function Harness() {
  const [v, setV] = useState("gym");
  return (
    <SegmentToggle
      options={[{ value: "gym", label: "Gimnasio" }, { value: "home", label: "Casa" }]}
      value={v}
      onChange={setV}
    />
  );
}

test("cambia el valor seleccionado al tocar una opción", async () => {
  await render(<Harness />);
  expect(screen.getByTestId("seg-gym").props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByText("Casa"));
  expect(screen.getByTestId("seg-home").props.accessibilityState.selected).toBe(true);
  expect(screen.getByTestId("seg-gym").props.accessibilityState.selected).toBe(false);
});
