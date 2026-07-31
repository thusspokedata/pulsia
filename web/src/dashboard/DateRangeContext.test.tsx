import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateRangeProvider, useDateRange } from "./DateRangeContext";

function Probe() {
  const { fromMs, toMs, setDays } = useDateRange();
  return (
    <div>
      <span>span:{Math.round((toMs - fromMs) / (24 * 3600 * 1000))}</span>
      <button onClick={() => setDays(30)}>30d</button>
    </div>
  );
}

test("por defecto 90 días y cambia a 30", async () => {
  render(<DateRangeProvider><Probe /></DateRangeProvider>);
  expect(screen.getByText(/^span:9[0-1]$/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "30d" }));
  expect(screen.getByText(/^span:3[0-1]$/)).toBeInTheDocument();
});
