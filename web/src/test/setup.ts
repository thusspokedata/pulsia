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
