# Actualizaciones in-app (OTA + botón APK) — diseño

> Fecha: 2026-07-05. Estado: aprobado (el usuario pidió "las dos"). Decisiones de sub-nivel autónomas.

## Objetivo
Que la app avise/permita actualizarse: **OTA** (EAS Update) para cambios de JS (auto + botón), y **botón "Descargar actualización"** (APK) para cambios nativos.

## Decisiones
- **OTA (EAS Update):** `expo-updates` + `channel` en el perfil `preview` + `runtimeVersion`. Botón "Buscar actualización" (`Updates.checkForUpdateAsync`/`fetchUpdateAsync`/`reloadAsync`). Auto-check al abrir (opcional). Publicar con `eas update --branch preview`.
- **Botón APK:** compara `versionCode` de Android (monótono). `autoIncrement: true` en el perfil `preview` → cada build sube el `versionCode`. La app lee el suyo con `expo-application` (`Application.nativeBuildVersion`); el backend `GET /app/latest` devuelve `{ versionCode, apkUrl, label }`; si `latest.versionCode > propio` → botón "Descargar actualización" que abre `apkUrl` (`Linking.openURL`). Tras cada build, se setea con `PUT /app/latest`.
- **Bootstrap:** OTA y `expo-application` son módulos nativos → **requieren un rebuild para activarse**. El primer build tras este feature lo habilita; de ahí en más, JS por OTA y nativo por APK.
- **UI:** sección "Actualizaciones" en Configuración con ambos botones + la versión actual.

## Decomposición (PRs)
- **U1 — Backend (este PR):** tabla `app_release` (singleton) + `GET /app/latest` + `PUT /app/latest` (auth). Sin dependencia de build.
- **U2 — Config mobile:** `expo-updates` + `expo-application` + `app.json` (updates url + runtimeVersion) + `eas.json` (channel `preview` + `autoIncrement`).
- **U3 — UI mobile:** api client `/app/latest` + sección "Actualizaciones" (OTA + APK) en Configuración.

## Edge cases
- Corriendo en Expo Go / dev (sin runtime de updates): el botón OTA detecta y muestra "no disponible en dev".
- Sin `/app/latest` seteado aún: no mostrar el botón APK (o "estás al día").
- `versionCode` propio no disponible: ocultar el botón APK.

## Fuera de alcance
- Auto-descarga del APK (solo abre el link; Android pide "instalar apps desconocidas" una vez).
- Rollback de OTA, canales múltiples (prod), forced updates.
