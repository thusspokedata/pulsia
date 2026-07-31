import { render, screen } from "@testing-library/react-native";
import type { CoverageResult } from "@pulsia/shared";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

// eslint-disable-next-line import/first
import { CoverageView } from "../src/nutrition/CoverageBlock";

const result: CoverageResult = {
  byNutrient: [
    { key: "vitamin_c_mg", foodAvg: 200, suppAvg: 0, ref: 110, state: "food", daysWithData: 20 },
    { key: "vitamin_d_mcg", foodAvg: 1, suppAvg: 20, ref: 15, state: "supplement", daysWithData: 20 },
    { key: "calcium_mg", foodAvg: 300, suppAvg: 0, ref: 950, state: "uncovered", daysWithData: 20 },
  ],
  counts: { food: 1, supplement: 1, uncovered: 1, fewData: 0 },
  onlyFoodPct: 33,
  daysRegistered: 26,
};

test("muestra la métrica del norte y los 3 estados", async () => {
  await render(
    <CoverageView current={result} evolution={[{ x: 1, y: 27 }, { x: 2, y: 33 }]} daysInPeriod={31} offset={0} expanded />,
  );
  expect(screen.getByText("33%")).toBeTruthy();
  expect(screen.getByText(/26 de 31 días/)).toBeTruthy();
  expect(screen.getByText("Vitamina C")).toBeTruthy(); // detalle expandido
  expect(screen.queryByText("Calcio")).toBeTruthy();
});

test("EmptyState cuando no hay clasificables", async () => {
  const empty: CoverageResult = {
    byNutrient: [],
    counts: { food: 0, supplement: 0, uncovered: 0, fewData: 0 },
    onlyFoodPct: null,
    daysRegistered: 0,
  };
  await render(<CoverageView current={empty} evolution={[]} daysInPeriod={31} offset={0} expanded />);
  expect(screen.getByText(/Sin datos suficientes/)).toBeTruthy();
});
