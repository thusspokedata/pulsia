# OTA `runtimeVersion` — manual, en lockstep con el APK

`mobile/app.json` usa un **`runtimeVersion` manual** (un string fijo), **no**
`{ policy: "fingerprint" }`.

## Por qué manual (no fingerprint)

Este es un monorepo con `bun`. El fingerprint de Expo se computa incluyendo los hashes del *store*
de Bun (`node_modules/.bun/<pkg>@<ver>+<hash>/…`), y ese `+<hash>` depende de la resolución del
monorepo **entero**. Un cambio en **cualquier** workspace que mueva el `bun.lock` raíz (p. ej. la
fundación web: Tailwind/shadcn/Recharts) cambia el runtime del móvil **sin tocar `mobile/`** → el
`eas update` sale con un runtime que **no le llega** al APK instalado (queda huérfano). Ya pasó
(vc10 `784872cb…` → `dd3738b7…` por #199/#205). El manual elimina esa dependencia.

## La regla

**`runtimeVersion` = el `versionCode` del APK que targetea.**

- APK actual objetivo: **versionCode 11** → `"runtimeVersion": "11"`.
- Toda OTA **JS-only** (código, sin cambios nativos) mantiene el mismo runtime → le llega al APK.
- El próximo APK **nativo** (versionCode 12) sube `runtimeVersion` a `"12"` en el mismo commit.

## Cuándo bumpear `runtimeVersion`

Bumpealo (y buildeá + distribuí un APK nuevo) **solo** cuando cambia la **capa nativa**:

- Agregar/quitar un módulo con código nativo (`expo-*` nativo, `react-native-*` nativo, etc.).
- Cambiar config de Expo que toca el binario (plugins nativos, permisos, `expo-build-properties`).
- Subir el SDK de Expo / React Native.

**NO** lo bumpees para cambios **JS-only** (lógica, UI, TS): esos van por OTA (`eas update`) al
runtime actual y le llegan al APK ya instalado.

## Checklist al sacar un APK nativo nuevo

1. Subir `runtimeVersion` en `mobile/app.json` al nuevo `versionCode` (p. ej. `"12"`).
2. Build local: `eas build --local` (ver `local-android-build` en memoria; el versionCode se
   auto-incrementa).
3. Confirmar que el APK reporta el runtime esperado (el string literal, no un hash).
4. Hostear el APK + `PUT /app/latest` con ese versionCode.
5. Repartir por `/download`; instalar en los teléfonos.
6. A partir de ahí, todo `eas update` debe reportar ese mismo runtime string.

## Gotcha histórico

Antes de esto se usaba `policy: "fingerprint"`. Los fingerprints por versión (`vc7`…`vc10`) están
documentados en la memoria `ota-fingerprint-gotcha`. Ya no aplican de acá en adelante: el runtime
es el string manual.
