import { expect, test } from "bun:test";
import { extractPageText } from "./extractPageText";

test("quita el contenido de <script> y <style>", () => {
  const html = `
    <html><head>
      <style>.x{color:red}</style>
      <script>var secreto = "no deberia aparecer";</script>
    </head><body><p>Proteinas 21 g</p></body></html>`;
  const out = extractPageText(html);
  expect(out).toContain("Proteinas 21 g");
  expect(out).not.toContain("secreto");
  expect(out).not.toContain("color:red");
});

test("quita <noscript> y comentarios HTML", () => {
  const html = `<noscript>activa js</noscript><!-- comentario oculto --><p>Hola</p>`;
  const out = extractPageText(html);
  expect(out).toBe("Hola");
});

test("conserva el texto de una tabla nutricional simulada", () => {
  const html = `
    <table>
      <tr><td>Proteinas</td><td>21 g</td></tr>
      <tr><td>Grasas</td><td>15 g</td></tr>
    </table>`;
  const out = extractPageText(html);
  expect(out).toContain("Proteinas 21 g");
  expect(out).toContain("Grasas 15 g");
});

test("decodifica las entidades HTML comunes", () => {
  const html = `<p>Sal &amp; az&#250;car &lt;ojo&gt; &quot;100&quot; &#39;g&#39;&nbsp;total</p>`;
  const out = extractPageText(html);
  // &#250; no está en la lista pedida, pero &amp; &lt; &gt; &quot; &#39; &nbsp; sí:
  expect(out).toContain("Sal & az");
  expect(out).toContain("<ojo>");
  expect(out).toContain('"100"');
  expect(out).toContain("'g'");
  expect(out).toContain("total");
  // &nbsp; se decodifica a espacio y luego colapsa: "g' total" queda con un solo espacio
  expect(out).toContain("'g' total");
});

test("colapsa espacios y newlines a un solo espacio, y trimmea", () => {
  const html = `  <p>uno</p>\n\n   <p>dos</p>   \t <p>tres</p>  `;
  const out = extractPageText(html);
  expect(out).toBe("uno dos tres");
});

test("respeta maxChars", () => {
  const html = `<p>${"a".repeat(500)}</p>`;
  const out = extractPageText(html, 100);
  expect(out.length).toBe(100);
});
