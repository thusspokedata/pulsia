# Diseño — Pulsia v1: Generador de rutinas con IA

**Fecha:** 2026-06-29
**Estado:** Aprobado para planificación

## 1. Contexto y visión

Pulsia es, a largo plazo, una app para registrar actividad física y de vida (entrenamiento,
comidas con foto + IA, descanso, salud, meditación) integrada con dispositivos Garmin y Polar.
El proyecto se construye **descompuesto en sub-proyectos independientes**, cada uno con su propio
ciclo diseño → plan → implementación.

**Este documento cubre el primer sub-proyecto (v1): el generador de rutinas con IA**, incluyendo
el import de actividades desde Garmin.

Sub-proyectos posteriores (fuera de alcance acá): comidas con foto + cálculo de calorías,
sueño/descanso, salud, meditación, y el sync automático en tiempo real de métricas Garmin/Polar.

### Principio rector

**Nada hardcodeado al usuario actual.** Todo el contexto de entrenamiento (equipamiento,
objetivos, días disponibles, lesiones) sale de un **perfil configurable**. La app es genérica
y forkeable: cualquiera la usa con su propio contexto. Existe una posible salida **comercial**
futura, por lo que las decisiones de arquitectura priorizan no tener que migrar después.

## 2. Qué hace la v1

A partir de un perfil de entrenamiento configurable, la IA genera un **programa multi-semana**
con progresión planificada, e incluye para cada día de gimnasio su **equivalente para entrenar
en casa**. Los ejercicios usan **nombres compatibles con el catálogo de Garmin** para poder
cargarlos a mano y ejecutarlos desde el reloj.

Capacidades de la v1:

1. **Onboarding / perfil** configurable.
2. **Generación conversacional** del programa (generar + ajustar por chat).
3. **Visualización** del programa, formateada para copiarlo fácil a Garmin.
4. **Registro de ejercicios** (series, reps, pesos) **editable a mano**.
5. **Import de actividad Garmin** (.FIT) → matcheo por nombre de ejercicio → autocompletado de logs.
6. **Memoria a largo plazo**: la IA tiene en cuenta el historial de meses al generar/ajustar.
7. **Dashboard de gráficos** analíticos.
8. **BYO API key** + **URL de backend configurable**.

## 3. Arquitectura

```
┌─────────────────────────┐                 ┌────────────────────────────────┐
│  App mobile (Expo/RN/TS) │   HTTP vía VPN  │  Raspberry Pi (casa) — Docker  │
│  - Onboarding/perfil     │ ──────────────▶ │  ┌──────────────────────────┐  │
│  - Generar/ajustar (chat)│                 │  │ Backend (Bun + Hono)     │  │
│  - Ver programa          │                 │  │ - Proxy seguro a Claude  │  │
│  - Registrar/editar logs │                 │  │ - Parser FIT (import)    │  │
│  - Subir .FIT de Garmin  │ ◀────────────── │  │ - API key encriptada     │  │
│  - Dashboard gráficos    │                 │  └────────────┬─────────────┘  │
│  (URL backend config.)   │                 │  ┌────────────┴─────────────┐  │
└─────────────────────────┘                 │  │ Postgres + pgvector      │  │
                                             │  └──────────────────────────┘  │
                                             └────────────────┬───────────────┘
                                                              │ Claude API
                                                              ▼ (structured output)
                                                       claude-sonnet-4-6
```

- **Mobile:** React Native + Expo + TypeScript. Cámara/sync en tiempo real quedan disponibles
  para sub-proyectos futuros pero no se usan en v1. La **URL del backend es configurable** en la
  app (sin hardcodear): apunta a la dirección de la VPN/LAN de casa ahora, y a Tailscale u otra
  opción en el futuro.
- **Backend:** Hono sobre Bun, dockerizado en la Raspberry Pi de casa. La API key de IA vive
  solo en el backend.
- **Base de datos:** Postgres con extensión `pgvector`, dockerizado en la Pi (imagen arm64).
  Drizzle ORM. Elegido sobre SQLite por: concurrencia real (salida comercial), window functions
  para los gráficos, y `pgvector` para la memoria semántica de la IA.
- **Migración futura:** si el proyecto muestra potencial, mover la DB a **Neon** (managed) es un
  `pg_dump`/restore — sin fricción porque se usa Postgres estándar y `pgvector` también está en Neon.
- **Acceso remoto:** por ahora vía la **VPN de casa** del usuario; **Tailscale** queda como opción
  contemplada (solo cambia la URL del backend en la config de la app).
- **IA:** Claude `claude-sonnet-4-6` con **structured output** (el programa vuelve como JSON
  validado contra schema, no como texto libre). Opción de escalar a Opus para casos complejos.
- **Auth v1:** un solo usuario, simple. El esquema de datos queda multi-usuario-ready.

## 4. Nombres compatibles con Garmin (catálogo de ejercicios)

Garmin Connect usa un **catálogo fijo de ejercicios de fuerza** definido en el FIT SDK
(categorías como `BENCH_PRESS`, `SQUAT`, `PULL_UP`, etc., cada una con variantes).

- Durante la implementación se genera ese catálogo a partir del FIT SDK y se persiste como
  tabla de referencia (incluye, por ejercicio, su(s) **grupo(s) muscular(es)** — necesario
  para los gráficos).
- La IA queda **restringida a elegir nombres de ese catálogo** vía el schema de structured
  output, de modo que lo que ves coincide con lo que aparece al armar el workout en Garmin.
- Ejercicios de casa que no existan en el catálogo → se mapean al equivalente Garmin más
  cercano o a una categoría genérica, con nota visible al usuario.
- **El mismo catálogo se usa para el import** (sección 7): los ejercicios del .FIT vienen con
  la misma taxonomía, así el matcheo es directo.

## 5. Generación conversacional

- Endpoint de **generación inicial**: recibe perfil + resumen de historial → Claude devuelve
  el programa estructurado.
- Endpoint de **ajuste conversacional**: el backend mantiene el hilo de conversación; el usuario
  pide cambios en lenguaje natural ("cambiá el día 3 por espalda", "menos volumen esta semana")
  y la IA devuelve el **programa actualizado** (siempre JSON validado).
- Validación: si la IA devuelve estructura inválida o un ejercicio fuera del catálogo →
  validación de schema + retry / mapeo al más cercano + flag.

## 6. Registro editable y memoria a largo plazo

- **WorkoutLog** es central: por cada serie ejecutada se registra reps + peso + fecha.
  Totalmente **editable a mano** por el usuario.
- **Memoria a largo plazo:** antes de generar o ajustar, el backend arma un **resumen agregado
  del historial** (progresión por ejercicio, PRs, volumen semanal por grupo muscular) y se lo
  pasa a la IA — **no** el log crudo, para no exceder el límite de tokens. Se usa `pgvector`
  para recuperación semántica de notas/eventos relevantes de meses anteriores.

## 7. Import de actividad Garmin (.FIT)

- El usuario exporta la actividad desde Garmin Connect como archivo **.FIT** y lo **sube a la app**.
- El backend lo **parsea con el FIT SDK**, extrae los `set` (ejercicio, reps, peso) registrados
  durante el entrenamiento de fuerza.
- **Matcheo por nombre de ejercicio** contra el catálogo (misma taxonomía Garmin) → vincula con
  el `Workout`/`ProgramExercise` correspondiente.
- **Autocompletado de logs:** se proponen los `WorkoutLog` a partir del .FIT; el usuario los
  **confirma o edita** antes de guardar (pantalla de reconciliación).
- Casos borde: ejercicios sin match, sets sin peso (peso corporal), archivos de actividades que
  no son de fuerza → se manejan con flags y edición manual.

## 8. Dashboard de gráficos

A partir de los logs + el mapeo ejercicio→grupo muscular:

- Frecuencia de entrenamiento por día de la semana.
- Volumen por grupo muscular (qué estás trabajando más).
- **Grupos musculares descuidados** (qué estás dejando sin entrenar).
- Progresión de cargas en el tiempo (por ejercicio / grupo).

Las consultas aprovechan window functions de Postgres.

## 9. Modelo de datos (resumen)

- **User** — identidad mínima (v1: un usuario; esquema multi-usuario-ready).
- **Settings** — API key de IA del usuario (encriptada), modelo elegido, URL de backend (cliente),
  preferencias.
- **Profile** — experiencia, objetivo (hipertrofia/fuerza/etc.), días/semana, duración de
  sesión, equipamiento gym[], equipamiento casa[], lesiones/limitaciones, preferencias.
- **ExerciseCatalog** (referencia) — nombre Garmin-compat, categoría Garmin, grupo(s)
  muscular(es), equipamiento requerido.
- **Program** — semanas, fecha de generación, snapshot de params usados, hilo de conversación.
- **Workout** (día del programa) — tipo (gym | casa), foco muscular, lista de ejercicios.
- **ProgramExercise** — ref a catálogo, series, reps objetivo, carga/progresión objetivo,
  descanso, notas.
- **WorkoutLog** — series ejecutadas (reps + peso) por ejercicio, fecha, origen (manual | import
  Garmin), notas. Editable.

## 10. Flujo principal

1. Onboarding → se guarda el perfil. Configuración → API key de IA + URL del backend.
2. "Generar programa" → backend arma prompt (perfil + resumen de historial) → Claude devuelve
   programa estructurado → se valida y guarda.
3. Ajustes por chat (opcional) → programa actualizado.
4. La app muestra el programa (semanas → días → ejercicios) para copiar a Garmin.
5. El usuario entrena desde Garmin → vuelve y **registra/edita** logs a mano, **o** sube el
   **.FIT** exportado de Garmin → la app autocompleta los logs → confirma/edita.
6. El dashboard refleja la actividad registrada.
7. La IA usa el historial acumulado en las siguientes generaciones/ajustes.

## 11. Manejo de errores

- IA devuelve estructura inválida → validación de schema + retry.
- Ejercicio fuera del catálogo Garmin → mapeo al más cercano + flag visible.
- .FIT inválido / no es de fuerza / ejercicio sin match → flags y edición manual.
- Red/timeouts (incluido el acceso vía VPN) → reintentos y estados de carga claros.
- API key inválida / sin créditos → mensaje claro al usuario en Configuración.
- La API key nunca viaja ni se almacena en el cliente.

## 12. Testing

- **Backend:** unit tests de armado de prompt, validación de schema, mapeo de nombres Garmin,
  **parseo de .FIT y matcheo de ejercicios**, agregación de historial; integration test de los
  endpoints de generación, ajuste e import (con Claude mockeado y .FIT de ejemplo); tests de las
  consultas analíticas.
- **Mobile:** tests de componentes de onboarding, viewer del programa, registro/edición de logs,
  pantalla de reconciliación de import, y render de gráficos.

## 13. Fases de implementación (dentro de la v1)

Para tener algo usable rápido y sumar de a poco:

1. **Fase 1 — Núcleo de generación:** perfil + catálogo Garmin + backend (Docker en Pi) con
   generación one-shot (structured output) + BYO API key + URL configurable + visualización del
   programa. (Algo usable end-to-end.)
2. **Fase 2 — Registro:** WorkoutLog editable + persistencia.
3. **Fase 3 — Import Garmin:** subida y parseo de .FIT + matcheo + pantalla de reconciliación.
4. **Fase 4 — Conversacional:** ajuste del programa por chat.
5. **Fase 5 — Memoria + Dashboard:** agregación de historial para la IA (pgvector) + gráficos.

## 14. Fuera de alcance (v1)

- Sync automático en tiempo real Garmin/Polar (más allá del import manual de .FIT).
- Comidas con foto + cálculo de calorías.
- Sueño/descanso, salud, meditación.
- Multi-usuario con auth completa (el esquema queda preparado, pero v1 es single-user).
