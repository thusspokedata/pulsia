# Evolución de nutrientes en el tiempo — diseño

Fecha: 2026-07-16
Estado: aprobado (pendiente de plan)

## Motivación

La pieza C dejó dos preguntas respondidas y una abierta:

- *"¿Cómo vengo hoy?"* → la pestaña **Nutrientes** (el total del día contra la referencia OMS).
- *"¿Quién me lo sube?"* → la pantalla del nutriente (**"Alimentos con más X"**, con rango Día/7/30).
- *"¿Estoy mejorando?"* → **nada lo responde todavía.**

Esta pieza cierra la tercera. El usuario tiene colesterol alto con antecedentes familiares y el
objetivo declarado es aprender a comer mejor. Saber qué alimento se lo dispara sirve para tomar
una decisión; ver la curva de las últimas semanas sirve para saber si esa decisión funcionó.

## Alcance

**Entra:** un gráfico de la evolución diaria del nutriente, dentro de la pantalla del nutriente
que ya existe, con la referencia OMS dibujada, el promedio y la cobertura de registro.

**No entra:** evolución de kcal ni de macros (el tab de Nutrición y la pestaña Resumen ya
muestran el día contra la meta; una vista histórica de eso es otra pieza). Tampoco entra ningún
cambio de backend, schema o dependencias.

## Decisiones tomadas

| Decisión | Elegido | Por qué |
| --- | --- | --- |
| Dónde vive | En la pantalla del nutriente, arriba del ranking | Una sola pantalla responde "cómo vengo" (la curva) y "quién es el culpable" (el ranking, abajo). Sin navegación nueva ni selector de rango duplicado. |
| El rango | El gráfico aparece desde 7 días | El selector Día/7/30 queda igual. Con "Día" un gráfico sería un solo punto, así que ahí se ve solo el ranking, como hoy. |
| Días sin registrar | No generan punto | Un día sin registrar **no es** un día en que comiste 0. Dibujarlo como 0 mentiría justo en la dirección peligrosa: los días que te olvidaste de cargar te bajarían el promedio y te harían creer que venís mejor. Se compensa mostrando la cobertura ("18 de 30 días con registro"). |
| Dónde agrupa por día | Función pura en `mobile/`, con `dateKey` | El límite del día es **local**: una cena a las 23:00 es de hoy, no de mañana en UTC. El resto de la pantalla ya razona en días locales; `shared/` no tiene noción de zona horaria (el backend usa una aproximación UTC documentada) y mezclar los dos criterios en la misma pantalla produce bugs de "me falta un día". |

## Arquitectura

### 1. La serie: `mobile/src/nutrition/nutrientSeries.ts`

```ts
export interface NutrientSeries {
  points: XY[];           // x = timestamp del día, y = total del nutriente ese día
  average: number | null; // promedio sobre los días CON registro, no sobre el rango
}

export function dailyNutrientSeries(meals: Meal[], nutrient: RankNutrient): NutrientSeries;
```

No hay campo `loggedDays`: es `points.length`. El total del rango (30) ya lo sabe quien llama —
es el `days` del selector — así que la nota de cobertura se arma con los dos sin guardar nada
derivado.

Agrupa los `meals` por `dateKey(m.eatenAt)` (día local) y suma el nutriente de cada ítem del día
con **`sumNullableMicro`** — el mismo helper que ya usa `buildNutritionDaySummary` para el total
del día. Eso importa: la curva y el número de la pestaña Nutrientes salen del mismo criterio, así
que no se pueden contradecir.

Un día genera punto solo si tiene dato:
- Día sin comidas → no aparece en el mapa → sin punto.
- Día con comidas pero **ningún ítem con el dato** (`sumNullableMicro` → `null`) → sin punto.
- Día con el dato en 0 (comiste, y el alimento declara 0) → **sí** genera punto en 0. Es
  información real, distinta de "no sé".

Los puntos salen ordenados por fecha ascendente (las comidas del backend no vienen con orden
garantizado, así que se ordena explícitamente).

El `x` es el **mediodía local** del día, reconstruido desde la clave `YYYY-MM-DD`
(`new Date(y, m - 1, d, 12)`), no el `eatenAt` de la primera comida. Dos razones: el eje X
representa el día, no el momento en que se comió — si no, dos días se separarían más o menos
según a qué hora desayunaste —, y el mediodía deja 12 horas de margen contra el DST, el mismo
criterio que ya usa `dayAtNoon` en el resto del repo.

### 2. La referencia: prop nuevo en `LineChart`

`mobile/src/components/LineChart.tsx` recibe un prop opcional:

```ts
refLine?: { value: number; label: string }
```

Dibuja una línea horizontal punteada en `value` con su etiqueta. **La referencia entra al dominio
del eje Y**: hoy `LineChart` calcula `minY`/`maxY` desde los datos, así que si el colesterol viene
en 100 y la referencia es 300, la línea quedaría fuera del gráfico — inútil justo cuando estás
yendo bien, que es cuando querés confirmarlo.

El prop es opcional y aditivo: `progreso.tsx` y `SessionSummary.tsx` (los otros dos consumidores)
no cambian.

**La fibra no lleva color distinto.** Es un piso (≥30 g) y no un techo, así que estar arriba es
bueno — lo contrario que los otros cuatro. La diferencia se comunica con el **texto** de la
etiqueta, no con otro color: un semáforo invertido para un solo nutriente es más confuso que un
rótulo. `NUTRIENT_REFERENCE_KIND` ya distingue `"min"` de `"max"`.

Las **saturadas** dependen de la meta de kcal (10% de la energía), que esta pantalla no tiene
cargada. Sin referencia disponible se dibuja el gráfico **sin** `refLine`, igual que la pestaña
Nutrientes muestra la fila sin barra.

### 3. La pantalla

En `mobile/app/nutricion/nutriente.tsx`, arriba del ranking y solo cuando `days >= 7`:

- El gráfico (`LineChart` con la serie y la `refLine`).
- Debajo, una línea de contexto: **"Promedio 240 mg · 18 de 30 días con registro"**.

El promedio es sobre los días con registro. Decir cuántos son es lo que permite saber si la curva
vale algo: un promedio de 3 días de 30 no es una tendencia.

Con **menos de 2 puntos** no se dibuja el gráfico y se muestra solo la nota ("Registrá al menos
dos días para ver la evolución"). Dos puntos es el mínimo para hablar de tendencia; con uno,
`LineChart` dibujaría un punto suelto que sugiere una línea plana que no existe.

## Manejo de errores

- **Rango sin ningún dato del nutriente** → no hay gráfico ni ranking; queda el empty state que
  la pantalla ya tiene ("Ningún alimento registrado aporta X en este período").
- **Falla el fetch** → el error inline que la pantalla ya muestra. Sin gráfico.
- **Un solo día con registro** → nota, sin gráfico (ver arriba).

Nada de esto es código nuevo de manejo de errores: la pantalla ya gatea todo con
`!loading && !error`.

## Testing

- `mobile/src/nutrition/nutrientSeries.ts`: tests unitarios con jest-expo. Casos: agrupación por
  día local, varias comidas el mismo día, día sin dato salteado, día con 0 incluido, orden
  ascendente, promedio sobre días registrados, rango vacío.
- `LineChart`: el `refLine` se dibuja y **entra al dominio Y** (el caso que importa: referencia
  muy por encima de los datos).
- `nutriente.tsx`: el gráfico no aparece con "Día"; sí con 7/30; la nota de cobertura dice los
  números correctos; con 1 solo día registrado no hay gráfico.
- TDD: test que falla primero, en cada tarea. Cada test nuevo se verifica por mutación.

## Entrega

Un PR. Sin migración, sin backend, sin dependencias nuevas → **OTA a vc10** (fingerprint
`784872cb…`, verificar en la salida de `eas update`).

## Fuera de alcance / follow-ups

- Evolución de kcal y macros en el tiempo.
- La paleta categórica para la torta de Calorías, que sigue pendiente de decisión del usuario
  (hoy la cena usa el ámbar que en el resto de la app significa "te pasaste").
