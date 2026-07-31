import "@testing-library/jest-dom/vitest";

// jsdom no implementa Blob/File#arrayBuffer (https://github.com/jsdom/jsdom/issues/2555).
// Se completa con FileReader (sí implementado por jsdom) para que el código de producción
// pueda usar la Web API estándar `file.arrayBuffer()` tal cual, sin ramas por entorno.
if (typeof Blob !== "undefined" && typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

// jsdom no implementa ResizeObserver. Recharts (ResponsiveContainer) lo usa para medir el
// contenedor; sin este stub, montar cualquier gráfico con datos revienta con un ReferenceError
// no capturado. El stub es un no-op: el tamaño real no importa para los tests, solo que no explote.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
