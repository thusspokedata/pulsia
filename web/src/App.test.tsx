import { render, screen } from "@testing-library/react";
import { App } from "./App";

test("renderiza el nombre de la app", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Pulsia" })).toBeInTheDocument();
});
