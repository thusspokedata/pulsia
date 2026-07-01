import { render, screen, fireEvent } from "@testing-library/react-native";
import { useState } from "react";
import { ChipGroup } from "../src/components/ChipGroup";

function Harness() {
  const [value, setValue] = useState<string[]>([]);
  return (
    <ChipGroup
      options={[{ value: "a", label: "Uno" }, { value: "b", label: "Dos" }]}
      selected={value}
      onChange={setValue}
    />
  );
}

test("togglea selección al tocar un chip", async () => {
  await render(<Harness />);
  await fireEvent.press(screen.getByText("Uno"));
  expect(screen.getByTestId("chip-a").props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByText("Uno"));
  expect(screen.getByTestId("chip-a").props.accessibilityState.selected).toBe(false);
});
