import { buildBodyData, MUSCLE_MAP } from "../src/session/muscleMap";

test("primary → intensity 1", () => {
  const { data, hasFullBody } = buildBodyData(["chest"], []);
  expect(data).toEqual([{ slug: "chest", intensity: 1 }]);
  expect(hasFullBody).toBe(false);
});

test("secondary → intensity 2", () => {
  const { data } = buildBodyData([], ["triceps"]);
  expect(data).toEqual([{ slug: "triceps", intensity: 2 }]);
});

test("músculo en primary y secondary → gana intensity 1 (primary)", () => {
  const { data } = buildBodyData(["chest"], ["chest"]);
  expect(data).toEqual([{ slug: "chest", intensity: 1 }]);
});

test("back → 3 slugs (upper-back, lower-back, trapezius)", () => {
  const { data } = buildBodyData(["back"], []);
  expect(data).toEqual([
    { slug: "upper-back", intensity: 1 },
    { slug: "lower-back", intensity: 1 },
    { slug: "trapezius", intensity: 1 },
  ]);
});

test("full_body no entra a data pero marca hasFullBody", () => {
  const { data, hasFullBody } = buildBodyData(["full_body"], []);
  expect(data).toEqual([]);
  expect(hasFullBody).toBe(true);

  const sec = buildBodyData([], ["full_body"]);
  expect(sec.data).toEqual([]);
  expect(sec.hasFullBody).toBe(true);
});

test("vacío → { data: [], hasFullBody: false }", () => {
  expect(buildBodyData([], [])).toEqual({ data: [], hasFullBody: false });
});

test("MUSCLE_MAP mapea full_body a null", () => {
  expect(MUSCLE_MAP.full_body).toBeNull();
});

test("forearms → slug forearm (secondary común en el catálogo)", () => {
  expect(MUSCLE_MAP.forearms).toEqual(["forearm"]);
  const { data } = buildBodyData([], ["forearms"]);
  expect(data).toEqual([{ slug: "forearm", intensity: 2 }]);
});

test("MUSCLE_MAP cubre los 12 grupos del enum", () => {
  expect(Object.keys(MUSCLE_MAP).length).toBe(12);
});
