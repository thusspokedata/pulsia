# OTA: `runtimeVersion` manual — diseño

**Fecha:** 2026-08-02
**Card:** Kan #38 (`infraotafp01`, P0)

## Problema

`mobile/app.json` usa `runtimeVersion: { policy: "fingerprint" }`. En este monorepo con `bun`,
el fingerprint del móvil se computa incluyendo los hashes del *store* de Bun
(`node_modules/.bun/<pkg>@<ver>+<hash>/…`), y ese `+<hash>` depende de la resolución del
monorepo **entero**. Cuando la fundación web (PRs #199/#205: Tailwind/shadcn/Recharts) agregó
deps al `bun.lock` **raíz**, la re-resolución cambió esos hashes → el runtime Android del móvil
pasó de `784872cb…` (vc10, el APK instalado en los teléfonos de la familia) a `dd3738b7…`,
**sin tocar `mobile/package.json`**. Consecuencia: todo `eas update` desde ~#199/#205 sale en
`dd3738b7` y **no le llega** a los vc10. El OTA de NUT-1 (agua) quedó huérfano.

## Objetivo

Que el `runtimeVersion` del móvil **no dependa** de la resolución del monorepo (lockfile raíz,
workspace `web/`, hashes del store de Bun, internals de `@expo/fingerprint`). Que cambie **solo**
cuando nosotros decidimos, en lockstep con un build de APK nativo nuevo.

## Decisión: `runtimeVersion` manual (fijo, string)

Se reemplaza `{ policy: "fingerprint" }` por un string fijo. **Regla:** el `runtimeVersion`
**es igual al `versionCode`** del APK que targetea. El próximo APK es versionCode **11** → runtime
`"11"`. Toda OTA JS-only posterior queda en `"11"` hasta el próximo APK nativo (vc12 → `"12"`).

### Por qué NO config de fingerprint (`.fingerprintignore` / `fingerprint.config.js`)

Habría que excluir justo las fuentes de ruido (lockfile raíz, store de Bun del workspace `web/`)
**sin** excluir el código nativo real del móvil, que vive en el **mismo** `node_modules/.bun/`.
Pasarse = perder **silenciosamente** la detección de cambios nativos (una OTA incompatible crashea
el APK y no nos enteramos). Quedarse corto = el drift sigue. Y no hay forma fácil de *verificar*
que quedó bien. Frágil y no auditable.

### Por qué SÍ el manual

- El runtime **nunca** cambia salvo que lo cambiemos: cero drift desde `web/`, backend,
  dependabot, hashes del store o internals de Expo.
- **Verificable de un vistazo**: se lee el string y se sabe exactamente qué es.
- El único riesgo (olvidar bumpearlo al cambiar lo nativo) está contenido: ya existe el ritual
  manual de buildear el APK local + `PUT /app/latest`; bumpear el string es un paso más ahí, y
  queda documentado en `docs/ota-runtime-version.md` + memoria.

## Trade-off aceptado

Con fingerprint, agregar un módulo nativo movía el runtime **automáticamente**. Con manual, hay que
acordarse de bumpear `runtimeVersion` **cuando cambia la capa nativa** (nuevo módulo nativo, cambio
de config de Expo que toca el binario). Si se olvida, un `eas update` podría llegar a un APK con
nativo incompatible → crash. Mitigación: la regla "runtime = versionCode" y el checklist en
`docs/ota-runtime-version.md`.

## Alcance

- `mobile/app.json`: `runtimeVersion` → `"11"`.
- `docs/ota-runtime-version.md`: la regla + el checklist de "cuándo bumpear".
- **No** deploya nada. El APK vc11 (build local + hosting + `PUT /app/latest` + reparto) es un
  segundo tramo, supervisado, fuera de este spec.

## Verificación (tramo 2, supervisado)

1. Build local del APK (`eas build --local`, versionCode auto 10→11).
2. Confirmar que `eas fingerprint`/`eas update --dry` ya no aplica: el runtime reportado debe ser
   `"11"` (string literal, no un hash).
3. Hostear el APK + `PUT /app/latest` (versionCode 11).
4. Repartir por `/download`; instalar en un teléfono.
5. Publicar una OTA de prueba y confirmar que **llega** (runtime `"11"`).
6. Recién ahí, NUT-1 (agua) pasa a Hecho.
