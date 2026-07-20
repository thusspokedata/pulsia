# Detalle de actividad de cardio — Fase 2 (visualización) — Diseño

**Fecha:** 2026-07-18
**Rama:** `feat/fit-detalle-actividad` (desde `origin/main` @ `6ce19f9`)
**Antecede:** #160 (captura total del `.FIT`, Fase 1)

## Objetivo

Mostrar lo que la Fase 1 ya captura. Hoy los escalares nuevos, el stream multicanal y los extras se
guardan pero **no se ven en ningún lado**: tocar una actividad en el historial abre el formulario de
edición.

**Solo pantalla: cero backend nuevo.** `getCardioById` ya existe y `getCardio` devuelve `samples` y
`fitExtras` completos (la Fase 1 los sacó del listado justo para que el detalle fuera el único que
los trae).

Las capturas que pasó el usuario son la especificación visual; se verificó que sus números salen
exactos del archivo.

## Navegación

`historial.tsx` hoy hace `router.push('/cardio?id=…')`, que es el **formulario de edición**. Pasa a
abrir una pantalla nueva de **solo lectura**, con un botón **"Editar"** que lleva al formulario
actual. El formulario no se toca.

Separar ver de editar mantiene cada archivo enfocado: `cardio.tsx` ya es un formulario largo, y
meterle diez tiles, cuatro gráficos y una tabla lo convertiría en dos pantallas disfrazadas de una.

## Estructura

1. **Encabezado** — tipo + fecha, rango horario, dispositivo y sensor.
2. **Tiles** (3 por fila) — duración, kcal, FC media/máx, cadencia media/máx, ciclos totales,
   efecto aeróbico (`/5`), carga de entrenamiento, respiración media.
3. **Gráficos** — FC, cadencia, respiración y Body Battery (inferido).
4. **Tiempo en zonas** — Z1–Z5 con su rango en ppm y una barra proporcional, desde `fitExtras.zones`.
5. **Detalles técnicos** — dispositivo, sensor de FC + batería, deporte, atleta, nº de muestras,
   distancia.

## Decisiones

### El campo `143` se muestra como inferido, no como un hecho
Garmin no documenta ese campo. Dedujimos que es Body Battery **del comportamiento** (decrece de
forma monótona durante la sesión). Se etiqueta *"Body Battery (inferido)"* con una nota al pie:
*campo sin nombre en el `.FIT`; el patrón coincide con Body Battery*. Presentarlo como confirmado
sería inventar precisión que no tenemos.

### La respiración es dispersa: se filtra, no se interpola
Aparece en ~1 de cada 3 muestras. El gráfico descarta los `null` y conecta los puntos que existen.
Interpolar dibujaría valores que el reloj nunca midió.

### El nombre del atleta NO se muestra
`fitExtras.athlete` incluye el nombre. Se muestran peso, altura, FC en reposo y FC máxima —que son
útiles— y se omite el nombre: no le aporta nada al dueño del teléfono y evita que aparezca si
comparte una captura.

### Degradación: una actividad manual no tiene nada de esto
Sin `samples`, sin `fitExtras`, sin escalares. La pantalla **renderiza solo lo que existe**: sin
tiles vacíos, sin gráficos sin datos, sin sección de zonas. No debe verse rota — es el caso de test
principal, no un caso borde.

## Piezas

| Archivo | Responsabilidad |
|---|---|
| `mobile/app/actividad.tsx` | La pantalla (solo lectura), recibe `?id=` |
| `mobile/src/components/StatTile.tsx` | Un tile: label, valor, unidad |
| `mobile/src/components/HrZoneBar.tsx` | Una fila de zona: nombre, rango, barra proporcional, tiempo |
| `mobile/src/cardio/cardioSeries.ts` | `samples` + canal → puntos `{x,y}`; generaliza `hrPoints.ts` |
| `mobile/src/cardio/activityFormat.ts` | Formateo puro: `mm:ss`, tiles presentes, texto del atleta |

Reusa `LineChart`, que ya se usa para FC. `hrPoints.ts` (Fase 1, quedó sin conectar por no haber
consumidor) se absorbe en `cardioSeries.ts`.

## Testing

La lógica que importa es pura y se testea sin renderizar:
- `cardioSeries`: canal disperso → descarta `null` y mantiene el pareo `t`/valor; canal ausente o
  todo-`null` → arreglo vacío (la pantalla no dibuja ese gráfico); fallback a `hrSeries`.
- `activityFormat`: qué tiles aparecen según qué campos hay; duración a `mm:ss`; el texto del atleta
  **nunca incluye el nombre** (test explícito).
- Render: una actividad **manual** (sin nada de la Fase 1) monta sin romperse y no muestra secciones
  vacías; una actividad de `.FIT` muestra tiles, gráficos y zonas.

**Fixtures sintéticos.** Nada de datos reales del usuario en tests — ver la regla del repo público.

## Fuera de alcance

- **Fase 3**: reprocesar los `.FIT` guardados para backfillear el histórico.
- Editar desde la pantalla nueva (el botón lleva al formulario existente).
- Confirmar qué son `135`/`136`/`144`.
- Comparar actividades entre sí o tendencias de carga en el tiempo.

## Verificación

`bun run typecheck && bun run test && bun run test:mobile`
