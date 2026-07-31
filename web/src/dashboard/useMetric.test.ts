import { metricUrl } from "./useMetric";

test("metricUrl arma el query con type/from/to", () => {
  expect(metricUrl("weight_kg", 1000, 2000)).toBe("/metrics?type=weight_kg&from=1000&to=2000");
});
