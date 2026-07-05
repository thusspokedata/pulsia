# Entreno puntual expandido — diseño

> Fecha: 2026-07-06. Estado: aprobado (el usuario pidió construirlo durante la noche). Decisiones de sub-nivel confirmadas por el usuario.

## Objetivo
Que el "entreno puntual" (one-off) sea mucho más expresivo para la IA: **varios músculos**, **tiempo elegible**, **equipo disponible explícito**, y **notas libres** para hoy (ej. "me duele la cintura", "no puedo hacer burpees").

Hoy el flujo manda `{ profile, location, focus: 1 músculo }`; el backend deriva el equipo del toggle gym/casa (`profile.gymEquipment`/`homeEquipment`), usa `profile.sessionMinutes` y `profile.limitations` en el prompt.

## Decisiones (confirmadas)
- **Equipo ↔ Lugar:** el toggle Gym/Casa se mantiene y **precarga** el multi-select de equipo desde `profile[location]Equipment`; luego es editable. El backend usa la lista final de equipo.
- **Tiempo:** chips preset (20/30/45/60/90) + opción "Otro" (input numérico). Default = `profile.sessionMinutes`. Override solo para esta sesión.
- **Notas:** texto libre, **solo esta sesión** (se suma a `limitations` en el prompt). No se persiste en memoria del atleta (YAGNI).

## Contrato nuevo (`POST /programs/generate-oneoff`)
Con **fallbacks** para tolerar version-skew (app vieja ↔ backend nuevo mientras se propaga el OTA/APK):

```jsonc
{
  "profile": TrainingProfile,
  "location": "gym" | "home",        // se mantiene: preset de equipo + contexto del prompt
  "focus": MuscleGroup[],            // era 1 músculo → array (mín 1). Acepta single legacy → [focus]
  "sessionMinutes": number,          // NUEVO (opcional): override 15–180 (fallback: profile.sessionMinutes)
  "equipment": Equipment[],          // NUEVO (opcional): equipo explícito de la sesión (fallback: equipo del location)
  "notes": string                    // NUEVO (opcional): texto libre
}
```

## Backend
- `shared`: nuevo `OneOffRequestSchema` (focus array mín 1, equipment array, sessionMinutes `int 15–180`, notes `string` opcional). Reutiliza `MuscleGroupSchema`/`EquipmentSchema`. Exporta el tipo.
- `buildOneOffPrompt(profile, { location, focus, sessionMinutes, equipment, notes })`:
  - Catálogo se arma con el `equipment` explícito. Si viene vacío → fallback al equipo del `location`.
  - "enfoque en los grupos musculares: X, Y, Z" — instruye cubrir todos, balanceado.
  - Usa `sessionMinutes` (override). La **cantidad de ejercicios la guía el tiempo** (~1 cada ~10 min) en vez del "máx 5" fijo.
  - Sección "Notas del atleta para HOY (respetalas estrictamente): `<notes>`" — ej. "no puedo hacer burpees" → evita ese ejercicio; "me duele la cintura" → evita carga lumbar. Solo si hay notas.
- Route `/generate-oneoff` + `generateProgramForProfile`: parsean/pasan los campos nuevos con fallbacks:
  - `focus`: acepta array; si llega single legacy → `[focus]`. Rechaza (400) si queda vacío.
  - `sessionMinutes`: valida 15–180; fallback `profile.sessionMinutes`.
  - `equipment`: array; si vacío → equipo del `location`.
  - `notes`: opcional.
- `workout.focus` se setea a `focus[0]` (primario). **Sin migración del schema `Program`** (workout.focus sigue siendo un `MuscleGroup` único). El mapa de músculos en la sesión se arma de los ejercicios (`primaryMuscles` vía catálogo), no de `workout.focus`, así que multi-músculo se ve bien.

## Mobile (`app/entreno-puntual.tsx`)
- Músculos: chips **multi-select** (Set, mín 1 para habilitar "Generar").
- Lugar: toggle se mantiene; al cambiarlo **precarga** el multi-select de equipo desde `profile[location]Equipment`.
- Equipo: chips multi-select en español (bodyweight→Peso corporal, dumbbell→Mancuerna, barbell→Barra, kettlebell→Kettlebell, resistance_band→Banda, pull_up_bar→Barra dominadas, bench→Banco, cable_machine→Polea, machine→Máquina, trx→TRX). Sembrado por el lugar, editable.
- Tiempo: chips 20/30/45/60/90 + "Otro" (input numérico). Default `profile.sessionMinutes`.
- Notas: `TextInput` multilínea ("¿Algo para hoy? ej: me duele la cintura, no puedo hacer burpees").
- `generateOneOff` manda el payload nuevo.

## Tests (TDD)
- `shared`: `OneOffRequestSchema` (focus array mín 1; equipment array; sessionMinutes fuera de rango falla; notes opcional).
- `backend` prompt: incluye todos los músculos pedidos; usa minutos override; catálogo del equipo explícito; incluye notas cuando existen; fallbacks (equipment vacío → location; focus single legacy → array).
- `backend` route: 400 si focus vacío; acepta payload nuevo; back-compat con `focus` single.
- `mobile` componente: multi-select de músculos; equipo sembrado por lugar y editable; chips de tiempo + custom; campo de notas; shape del payload enviado.

## Decomposición (PRs)
- **PR-A — shared + backend (contrato):** `OneOffRequestSchema`, `buildOneOffPrompt`, route, `generateProgramForProfile`. Los fallbacks permiten mergear/deployar A antes que B sin romper la app vieja.
- **PR-B — mobile UI:** `entreno-puntual.tsx` + `api/programs.ts`.

## Fuera de alcance (YAGNI)
- Persistir notas en la memoria del atleta.
- Migrar `workout.focus` a array.
- forearms/calves/full_body como focus (se dejan los 9 prácticos actuales).
- Auto-ajuste multi-día (sigue siendo un único día puntual).
