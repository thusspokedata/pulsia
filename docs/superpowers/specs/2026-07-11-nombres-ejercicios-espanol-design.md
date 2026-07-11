# Nombres de ejercicios en español (sesión)

> Diseño. Fecha: 2026-07-11. Feature JS/data-only → se entrega por **OTA a vc8** (se bundlea con los fixes de sesión ya mergeados y pendientes de OTA).

## Objetivo

Mostrar el nombre de cada ejercicio **en español** en la pantalla de sesión, para gente que no lee inglés, manteniendo el nombre en **inglés** (el estándar, que sirve para buscar en el reloj Garmin/Coros) como secundario.

## Contexto

- El catálogo (`shared/src/catalog/exercises.data.ts`, **auto-generado** por `scripts/generate-catalog.ts` desde el FIT SDK de Garmin) tiene 230 ejercicios con `id`, `garminName` (inglés), `displayName` (hoy == inglés), músculos y equipo.
- El programa/sesión guardan `catalogId` + `garminName` por ejercicio → se puede resolver el nombre en español **por `catalogId`** sin tocar los schemas de programa/sesión.
- La app muestra `garminName` (inglés) en: el título del ejercicio activo (`mobile/app/sesion.tsx`), la lista de ejercicios y el picker de "Cambiar ejercicio".

## No-objetivos (YAGNI)

- **No** se toca la preferencia Garmin/Coros ni el push a relojes (proyecto futuro, spec propio: ambos son viables con acceso de partner — Garmin Training API / Coros Training Hub API).
- **No** se agrega un toggle de idioma: siempre se muestran ambos (español principal + inglés secundario), decisión del usuario.
- **No** se traduce el resto de la app (labels de UI ya están en español); solo los **nombres de ejercicios**.
- Alcance de display: **pantalla de sesión** (`sesion.tsx`). El viewer del programa puede sumarse después con el mismo helper (fuera de alcance de esta tanda).

## Decisiones cerradas

- Español **principal** + inglés **secundario** (subtítulo).
- Traducciones **estáticas** (baked), generadas una vez con Claude. Fallback al inglés si falta alguna.
- El mapa de traducciones vive **separado** del catálogo auto-generado (para que regenerar el catálogo no lo pise).

## Diseño

### Datos (shared)

- **Nuevo archivo `shared/src/catalog/exercises.es.ts`:**
  ```ts
  // Traducciones al español de los nombres de ejercicios (por catalogId). Curado a mano/IA,
  // SEPARADO del catálogo auto-generado (regenerar el catálogo no debe pisar esto).
  export const EXERCISE_NAMES_ES: Record<string, string> = { /* 230 entradas id → español */ };
  ```
  Las 230 traducciones se generan una vez con Claude a partir de los `garminName` reales (español natural de gimnasio, p.ej. `dumbbell_biceps_curl` → "Curl de bíceps con mancuerna", `barbell_bench_press` → "Press de banca con barra").

- **Helper en `shared/src/catalog/exercises.ts`** (re-exportado por `shared/src/index.ts`):
  ```ts
  import { EXERCISE_NAMES_ES } from "./exercises.es";
  // Nombre en español por catalogId; undefined si no hay traducción (el caller cae al inglés).
  export function exerciseNameEs(catalogId: string): string | undefined {
    return EXERCISE_NAMES_ES[catalogId];
  }
  ```

### Display (mobile, `sesion.tsx`)

- **Ejercicio activo** (título grande, hoy `{current.garminName}`): dos líneas.
  - Principal (grande): `exerciseNameEs(current.catalogId) ?? current.garminName`.
  - Secundario (chico, `colors.textMuted`): `current.garminName` — solo si hay traducción y difiere del principal (si no hay traducción, no se duplica).
- **Lista de ejercicios** (rows) y **picker "Cambiar ejercicio"**: mostrar el nombre en español (`exerciseNameEs(id) ?? nombreInglés`), una línea, compacto. En la lista `id` viene de la sesión (`e.catalogId`); en el picker de las alternativas del catálogo (`e.id`).
- Un helper de presentación chico en el componente evita repetir la expresión (p.ej. `const esName = (catalogId: string, en: string) => exerciseNameEs(catalogId) ?? en;`).

### Testabilidad

- **Test de cobertura (`shared`):** todo `EXERCISE_CATALOG[i].id` tiene entrada en `EXERCISE_NAMES_ES` (garantiza que no queda ningún ejercicio sin traducir). Si el catálogo crece sin traducción, el test rompe y avisa.
- **Test del helper:** `exerciseNameEs(id conocido)` devuelve el español; `exerciseNameEs("no-existe")` → `undefined`.
- **Mobile:** un test de render que verifica que el ejercicio activo muestra el nombre en español (principal) y el inglés (secundario), reutilizando el patrón de montaje existente de `sesion.test.tsx`.

## Entrega

JS/data-only → **OTA a vc8** (runtime `88cc46dd…`). Se publica junto con los fixes de sesión (Terminar serie / RPE) ya en `main`, en un solo `eas update`.

## Riesgos

- **Calidad de las 230 traducciones:** generadas con IA → revisar/spot-check antes de bakear (nombres de gimnasio naturales, no traducciones literales raras). El fallback al inglés cubre cualquier faltante, y el test de cobertura obliga a que estén todas.
