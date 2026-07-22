# Nutrientes completos por alimento y por comida (USDA local)

**Fecha:** 2026-07-22
**Estado:** diseño aprobado, pendiente de plan de implementación
**Alcance:** piezas A (modelo de datos + fuente) y B (pantallas). La pieza C (calidad
nutricional + impactos) y la descomposición de un plato en ingredientes quedan **fuera**, cada
una con su propio spec.

## 1. Disparador

El usuario mostró capturas de la app **Pulso** con el detalle de un alimento: calidad
nutricional, impacto metabólico/digestivo/cardiovascular, aporte a los objetivos del día, y un
listado completo de vitaminas y minerales con barra y `X/Y · %`. Pedido: *"necesito tener más
información por comidas"*.

Hoy Pulsia guarda **10 números por alimento**: kcal, proteína, carbos, grasa, saturadas,
azúcares, fibra, sal, colesterol y agua. Las capturas implican **36**.

(Nota lateral, fuera de este spec: **"Pulso" ya existe como app**. En algún momento hay que
decidir si Pulsia conserva el nombre.)

## 2. Decisiones tomadas

Cada una se discutió y la aprobó el owner.

| # | Decisión | Alternativas descartadas |
|---|---|---|
| 1 | **Híbrido**: base pública primero, IA como fallback marcado como estimado | Solo IA (números inventados con cara de dato); solo base pública (deja afuera la comida casera) |
| 2 | **Copia local** de USDA en la Postgres de la Pi | API en vivo de FoodData Central (dependencia externa, rate limit por IP) |
| 3 | Alcance **A + B**; C aparte | Todo junto |
| 4 | **25 columnas nuevas**; sodio reemplaza a sal; carbos netos derivado | Guardar carbos netos; mantener sal y sodio en paralelo |
| 5 | **Matching híbrido**: la IA elige, el usuario puede corregir | IA sola (contamina el catálogo en silencio); usuario siempre (fricción en cada alta) |
| 6 | **Dos procedencias** (etiqueta / bloque USDA), y `estimate` se abre en `ai` / `manual` | Una sola fuente por alimento; procedencia por cada nutriente |
| 7 | Referencias diarias de **EFSA**, **personalizadas por sexo y edad**, con fallback neutro | DRI estadounidense; tabla única para todos |
| 8 | **Tres superficies** con un componente compartido | Solo el detalle de comida |
| 9 | **FNDDS incluido** en el dataset | Solo Foundation + SR Legacy (sin cobertura de platos preparados) |
| 10 | La descomposición por ingredientes va **después**, en su propio spec | Meterla acá |

### Sobre la decisión 10

El owner prefiere la descomposición por ingredientes y aceptó diferirla. Las razones:
depende enteramente del matcher que se construye acá; este spec ya carga dataset, migración
destructiva, matching y tres pantallas; y **el eslabón débil de la descomposición no son los
nutrientes sino los gramos estimados desde una foto**, que merece su propia discusión. Además,
usar esto unas semanas mide cuánto cubre FNDDS de la comida real del usuario, que es
exactamente el dato que hoy falta para dimensionar la descomposición.

### Corrección a una propuesta previa

Durante el brainstorming se propuso **pgvector** para el matching. Es incorrecto: la extensión
viene en la imagen de Docker pero **no se usa en ninguna parte del backend** (ni una columna
`vector`), y **Anthropic no ofrece API de embeddings**, así que generarlos exigiría sumar un
proveedor nuevo solo para esto. Con 7.800–16.000 filas, la búsqueda de texto de Postgres
alcanza. Queda documentado para que nadie lo reintroduzca.

## 3. Los nutrientes

**Ya existen (9 persistidos + derivados):** kcal, proteína, carbos, grasa, saturadas, azúcares,
fibra, colesterol, agua.

**Nuevos (25 columnas persistidas):**

- **Grasas (2):** omega-3, omega-6
- **Minerales (9):** calcio, hierro, magnesio, yodo, fósforo, potasio, selenio, sodio, zinc
- **Vitaminas (14):** A, B1, B2, B3, B5, B6, B7, B9, B12, C, D, E, K, colina

El sodio de esa lista **reemplaza** a `salt_g`, que se elimina (ver abajo).

**Cuentas:** 9 persistidos que se conservan + 25 nuevos = **34 columnas**; más los 2 derivados
(carbos netos y sal) = **36 nutrientes visibles**.

**Derivados, no persistidos:**

- **Carbos netos** = `carbs_g − fiber_g`, con piso en 0. Puede dar negativo con datos reales
  (verduras de hoja donde la fibra medida supera a los carbos totales declarados).
- **Sal** = `sodium_mg × 2,5 ÷ 1000`. Se conserva porque la referencia OMS de 5 g/día ya está
  en la app y es la que el usuario reconoce.

**Sodio reemplaza a sal como dato guardado.** Hoy se persiste `salt_g`; USDA entrega sodio en
mg. Mantener los dos permite que diverjan y pone a discutir la referencia OMS de sal contra la
de sodio. Fuente única: `sodium_mg`.

**Yodo y biotina (B7) van a venir mayormente vacíos.** USDA los mide poco: en SR Legacy el
yodo está ausente en casi todo y la biotina también. Se incluyen igual, mostrando **"sin dato"**
— porque un `0` afirma "no tiene", que es falso y distinto de "no lo sabemos".

## 4. Arquitectura

### 4.1 Tabla `usda_food`

Tabla nueva en la Postgres de la Pi. Una fila por alimento de USDA, con los 34 nutrientes por
100 g.

```
usda_food
  fdc_id          integer primary key
  description     text not null          -- en inglés, como viene de USDA
  data_type       text not null          -- 'foundation' | 'sr_legacy' | 'survey'
  <34 columnas numéricas nullable, por 100 g>
```

Índices: `pg_trgm` (GIN) sobre `description` para búsqueda por similitud, más un índice de
texto completo. `pg_trgm` es contrib estándar y está disponible en la imagen que ya corre.

**Volumen:** Foundation (~300) + SR Legacy (~7.800) + FNDDS/Survey (~7.000-8.000) ≈ **16.000
filas**. Irrelevante para esa base.

**Licencia:** los datos de USDA FoodData Central son **dominio público** (obra del gobierno de
EE.UU.). No se repite el problema que hizo descartar `free-exercise-db`.

### 4.2 Carga del dataset

Los CSV originales de USDA pesan cientos de MB y **no van al repo**.

1. Un script de desarrollo baja los CSV, se queda solo con los nutrientes de la lista y escribe
   un **artefacto compacto comprimido** (orden de 1-2 MB).
2. **Ese artefacto sí se versiona**, para que un deploy sea reproducible sin depender de que
   USDA esté disponible.
3. La carga a la tabla corre **en el arranque del contenedor**, junto a las migraciones que ya
   se auto-aplican, y es **idempotente por versión de dataset**: si la versión cargada coincide,
   no hace nada.

El script de descarga se corre a mano y rara vez: SR Legacy está congelado desde 2018.

### 4.3 El matcher, como servicio propio

**Restricción de diseño explícita:** el matcher es un módulo con interfaz propia —recibe un
texto de búsqueda, devuelve candidatos con sus nutrientes— y **no vive dentro del handler de
`/foods/extract`**. El spec siguiente (descomposición por ingredientes) lo va a llamar N veces,
una por ingrediente. Si queda acoplado al alta de un alimento, ese spec empieza refactorizando.

**Prioridad de resultados:** Foundation y SR Legacy antes que FNDDS. FNDDS son valores
derivados de recetas, no de laboratorio — muy por encima de una estimación de IA, un escalón
por debajo de los otros dos. Se prefiere el alimento simple medido; se cae a FNDDS para platos
preparados.

### 4.4 Cambios en el schema compartido

En `shared/src/schemas/nutrition.ts`, sobre `FoodExtractionSchema` y `MealItemSchema`:

- **+25 campos**, todos `nullable().optional()`, como los micros actuales.
- **`salt_g` sale, entra `sodium_mg`.**
- **`source` se parte en dos:**
  - `sourceMacros`: `label` | `ai` | `manual`
  - `sourceMicros`: `usda` | `ai` | `null`

El valor `estimate` desaparece. La distinción "lo estimó la IA" vs "lo cargó el usuario a mano"
estaba pendiente en el backlog; se resuelve acá porque la migración se hace igual.

### 4.5 Migración de datos existentes

Hay alimentos y comidas reales del usuario en la base. Una sola migración, tres pasos:

1. `sodium_mg = salt_g × 1000 ÷ 2,5`, después se elimina `salt_g`.
2. Todo `source = 'estimate'` pasa a `sourceMacros = 'ai'`; `source = 'label'` a
   `sourceMacros = 'label'`.
3. Los 25 nutrientes nuevos quedan en **`null`** (no `0`) y `sourceMicros = null`.

**Los snapshots de comidas ya registradas NO se re-matchean contra USDA.** Una comida es el
registro histórico de lo que se comió con los datos que había; reescribirla con números nuevos
falsea el pasado. Los alimentos del **catálogo** sí pueden re-matchearse, pero como **acción
explícita del usuario**, nunca automática.

## 5. Flujos

### 5.1 Alta de un alimento

```
foto o texto
   → IA (1ª llamada): identifica → { nombre en español, frase de búsqueda en inglés, macros estimados }
   → matcher: busca en usda_food → hasta 8 candidatos
   → IA (2ª llamada): elige el mejor candidato
   → pantalla de confirmación: 36 nutrientes + chip `USDA · Egg, whole, cooked, fried`
      + "¿no es este?" → despliega candidatos → al elegir otro, recalcula
   → guardar
```

Cuesta **una llamada de IA más por alta**. Compra que los micros dejen de ser inventados.

### 5.2 Cuándo hay etiqueta

Si la foto es de un paquete, la etiqueta es el mejor dato para lo suyo (8 números medidos por
el fabricante) pero no trae vitaminas. Regla: **la etiqueta gana en los campos que cubre, USDA
rellena el resto**, y cada bloque declara su procedencia (`sourceMacros` / `sourceMicros`). La
UI muestra dos chips en vez de uno.

## 6. UI

### 6.1 El componente compartido

Lista agrupada en **Grasas / Carbohidratos / Vitaminas / Minerales**. Cada fila: ícono, nombre,
`X/Y` con unidad, `%`, y una barra.

Recibe los valores y la referencia contra la que compara — **nada más**. Eso lo hace servible en
las tres superficies sin ramificar por pantalla.

### 6.2 Las tres superficies

| Superficie | Estado | Referencia que recibe |
|---|---|---|
| Detalle de **comida** | **nueva** — es la de las capturas | referencia diaria personal |
| Detalle de **alimento del catálogo** | **nueva** | ninguna: muestra valores por 100 g |
| Pestaña **"Nutrientes"** del día (`nutricion/detalle.tsx`) | existe, hoy muestra 4 referencias | referencia diaria personal |

**Fuera de alcance:** el rediseño visual de la card de comida (chip de foto, estrellas, menú de
tres puntos). Eso es identidad visual y hay una decisión de paleta abierta en el backlog. Entra
el **contenido**: nutrientes agrupados, barras, porcentajes e ingredientes.

Los **ingredientes** de una comida ya existen en el modelo (una comida es una lista de ítems con
gramaje). Falta presentarlos como en las capturas; eso entra acá.

### 6.3 `null` no es `0`

Un nutriente sin dato muestra **"sin dato"** en gris, sin barra y sin porcentaje.

En el detalle de una comida y en el del catálogo se resuelve solo: hay valor o no lo hay.

**En el total del día no.** Hoy `sumNullableMicro` suma los ausentes como cero, así que un total
puede decir "0,8 mg de zinc" cuando la verdad es "0,8 de los tres alimentos que tenían dato, y
de los otros cuatro no sabemos". El total lleva una **marca de parcial** cuando algún ítem que
suma no tiene ese dato.

Esto **no** es el badge de "estimado" del backlog (que exige definir qué se mide y merece su
propia discusión). Es solo distinguir un total completo de uno con agujeros.

### 6.4 Referencias diarias

Tabla en `shared/src/nutrition/references.ts`, con valores de **EFSA (Dietary Reference
Values)**, coherente con las referencias OMS/EFSA ya citadas ahí.

**Personalizadas por sexo y edad**, que ya están en `TrainingProfileSchema` (ambos opcionales),
con **fallback a valores neutros** para quien no los cargó. El caso que lo motiva es el
**hierro: 8 mg para un varón adulto contra 16-18 mg para una mujer en edad fértil** — no es un
matiz, es el doble, y la familia en Argentina es el caso real. Calcio y yodo tienen la misma
historia en menor escala.

Sigue sin ser una "meta": es la referencia pública **que le corresponde a esa persona**, lo cual
es más fiel al comentario que ya está en `references.ts` ("no son metas personales"), no menos.

> ⚠️ **Para la implementación:** los valores exactos de EFSA se transcriben **de la fuente
> publicada**, no de memoria, y cada uno lleva un comentario citando de dónde salió. Un número
> de referencia equivocado es invisible en code review y le miente al usuario para siempre.

## 7. Errores y degradación

| Situación | Comportamiento |
|---|---|
| La búsqueda no devuelve candidatos (dulce de leche, Leberkäse, un guiso) | El alimento se guarda igual, con macros estimados por la IA y vitaminas en `null`, `sourceMicros = null`. **El alta nunca se bloquea.** |
| Falla la 2ª llamada de IA | Se ofrecen los candidatos para elegir a mano |
| `usda_food` vacía (la carga no corrió) | El alta cae al comportamiento actual y el backend lo loguea. Degradado, no roto. |

## 8. Testing

TDD con **verificación por mutación de cada test nuevo** (romper el código a propósito y
confirmar que el test se queja), como el resto del repo.

Casos obligatorios — son donde este spec se rompe en silencio:

1. **Conversión sal↔sodio** de la migración, en las dos direcciones.
2. **Total del día mezclando ítems con dato y sin dato** → tiene que dar **parcial**, no un
   número limpio y mentiroso.
3. **Carbos netos con fibra > carbos** (verduras de hoja) → no puede dar negativo.
4. **La referencia de hierro cambia con el sexo del perfil**, y cae al valor neutro cuando el
   perfil no lo tiene.
5. **Un alimento sin match no rompe el alta.**
6. **Idempotencia de la carga del dataset**: correr el arranque dos veces no duplica filas.
7. **El matcher prioriza Foundation/SR Legacy sobre FNDDS** ante candidatos equivalentes.

> ⚠️ **Trampa conocida en el caso 4:** el test se pasa en verde si el fixture usa un perfil sin
> sexo, porque ahí el valor esperado y el fallback coinciden. Es exactamente la familia de test
> falso que apareció en las últimas cinco sesiones de este repo. El plan debe exigir la
> verificación por mutación de cada uno de estos, explícitamente.

## 9. Fuera de alcance (y por qué)

| Tema | Por qué no acá |
|---|---|
| **Calidad nutricional + impactos** (metabólico / microbiota / cardiovascular) | No es un dato, es un juicio: exige definir criterio, evidencia, y bancarse que la app le diga a alguien que lo que comió le hace mal. Spec propio. Se apoya en los nutrientes nuevos, así que va después por necesidad. |
| **Descomposición de un plato en ingredientes** | Ver §2. Spec propio, el siguiente. |
| **Rediseño visual de la card de comida** | Identidad visual, con decisión de paleta abierta en el backlog. |
| **Badge de "estimado" en los totales** | Ya en el backlog; exige definir qué se mide (¿% de kcal? ¿por nutriente?) antes de dibujar nada. |
| **Renombrar la app** | Decisión de producto del owner. |

## 10. Referencias

- USDA FoodData Central — [guía de la API y datasets](https://fdc.nal.usda.gov/api-guide)
- EFSA — Dietary Reference Values (valores a transcribir de la fuente en implementación)
- Código tocado: `shared/src/schemas/nutrition.ts`, `shared/src/nutrition/references.ts`,
  `shared/src/nutrition/macros.ts` (`sumNullableMicro`), `backend/src/routes/nutrition.ts`,
  `backend/src/ai/`, `mobile/app/nutricion/`
