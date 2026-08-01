import { mediaMovil } from "./mediaMovil";

test("media móvil centrada en el medio", () => {
  // ventana=3 (r=1): cada punto promedia [i-1, i+1]
  const pts = [
    { t: 1, v: 2 },
    { t: 2, v: 4 },
    { t: 3, v: 6 },
    { t: 4, v: 8 },
    { t: 5, v: 10 },
  ];
  const ma = mediaMovil(pts, 3);
  // conserva t y largo
  expect(ma.map((p) => p.t)).toEqual([1, 2, 3, 4, 5]);
  // i=2 promedia [4,6,8]=6, i=1 promedia [2,4,6]=4, i=3 promedia [6,8,10]=8
  expect(ma[1].v).toBe(4);
  expect(ma[2].v).toBe(6);
  expect(ma[3].v).toBe(8);
});

test("recorta la ventana en los bordes (sin huecos)", () => {
  const pts = [
    { t: 1, v: 2 },
    { t: 2, v: 4 },
    { t: 3, v: 6 },
    { t: 4, v: 8 },
    { t: 5, v: 10 },
  ];
  const ma = mediaMovil(pts, 3);
  // i=0 solo tiene [2,4]=3, i=4 solo tiene [8,10]=9
  expect(ma[0].v).toBe(3);
  expect(ma[4].v).toBe(9);
});

test("la media es centrada, no trailing (detecta mutación del centrado)", () => {
  // un pico en i=3; una ventana centrada en i=2 lo capta (=10),
  // una trailing [i-2,i] daría 0 → distingue centrado de trailing
  const pts = [
    { t: 1, v: 0 },
    { t: 2, v: 0 },
    { t: 3, v: 0 },
    { t: 4, v: 30 },
    { t: 5, v: 0 },
  ];
  const ma = mediaMovil(pts, 3);
  // i=2 promedia [0,0,30]=10
  expect(ma[2].v).toBe(10);
});

test("el tamaño de ventana importa (detecta mutación de la ventana)", () => {
  const pts = [
    { t: 1, v: 0 },
    { t: 2, v: 0 },
    { t: 3, v: 0 },
    { t: 4, v: 0 },
    { t: 5, v: 10 },
  ];
  // i=2: ventana=3 → [0,0,0]=0 ; ventana=5 → [0,0,0,0,10]/5=2
  expect(mediaMovil(pts, 3)[2].v).toBe(0);
  expect(mediaMovil(pts, 5)[2].v).toBe(2);
});

test("suaviza un pico atípico respecto del crudo", () => {
  const pts = [
    { t: 1, v: 10 },
    { t: 2, v: 10 },
    { t: 3, v: 100 },
    { t: 4, v: 10 },
    { t: 5, v: 10 },
  ];
  const ma = mediaMovil(pts, 3);
  // i=2 promedia [10,100,10]=40, muy por debajo del crudo (100)
  expect(ma[2].v).toBe(40);
  expect(ma[2].v).toBeLessThan(pts[2].v);
});

test("un solo punto → mismo punto", () => {
  expect(mediaMovil([{ t: 1, v: 5 }], 7)).toEqual([{ t: 1, v: 5 }]);
});

test("array vacío → array vacío", () => {
  expect(mediaMovil([], 7)).toEqual([]);
});

test("ventana <= 1 → copia igual (nuevo array)", () => {
  const pts = [
    { t: 1, v: 3 },
    { t: 2, v: 9 },
  ];
  const ma = mediaMovil(pts, 1);
  expect(ma).toEqual(pts);
  expect(ma).not.toBe(pts); // es una copia, no la misma referencia
});
