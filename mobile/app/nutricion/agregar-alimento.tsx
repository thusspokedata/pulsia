import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { getBackendUrl } from "../../src/storage/config";
import {
  extractFood, describeFood, createFood, getFood, updateFood,
  getUsdaEntry, searchUsdaFoods, assembleUsdaFood, type UsdaEntry,
} from "../../src/api/nutrition";
import { NUTRIENT_KEYS } from "@pulsia/shared";
import type { FoodBasis, FoodExtraction, FoodIdentification, NutrientValues, SourceMacros, SourceMicros } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";
import { SourceChip } from "../../src/nutrition/SourceChip";
import { NutrientFlags } from "../../src/nutrition/NutrientFlags";

const num = (s: string) => Number(s.replace(",", "."));
const optNum = (s: string) => (s.trim() === "" ? null : num(s));

// El formulario habla en SAL: es lo que dice el envase, lo que el usuario reconoce y la unidad de
// la referencia de la OMS. Lo que se persiste es SODIO (es lo que entrega USDA y es la fuente
// única). Las dos puntas de la conversión viven acá, y las usan el campo, el aviso "Sodio ≈ …" y
// el semáforo: una segunda cuenta escrita a mano en cualquiera de los tres es cómo la pantalla
// termina mostrando un número y guardando otro.
const SALT_TO_SODIUM = 2.5; // NaCl / Na, el mismo factor que saltGFromSodiumMg en shared

// Sal (g) → sodio (mg), a partir del texto crudo del campo. null si está vacío o no es un número.
function sodiumMgFromField(raw: string): number | null {
  const v = optNum(raw);
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round((v / SALT_TO_SODIUM) * 1000);
}

// Sodio (mg) → texto del campo de sal. NO usa `saltGFromSodiumMg` de shared a propósito: ese
// redondea a 1 decimal porque es para MOSTRAR, y con esa precisión abrir y guardar un alimento de
// 12 mg de sodio lo dejaría en 0 g de sal → 0 mg. Acá el número vuelve al backend, así que la ida
// y vuelta se hace a 3 decimales (0,001 g de sal = 0,4 mg de sodio) y no pierde el dato.
function saltFieldFromSodiumMg(mg: number | null | undefined): string {
  if (mg == null || !Number.isFinite(mg)) return "";
  return String(Math.round(mg * SALT_TO_SODIUM) / 1000);
}

// Los seis micros "de etiqueta" que el formulario edita. Los otros 24 (vitaminas y minerales) no
// se cargan a mano: salen de USDA y viajan de largo (ver `carried`).
const FORM_NUTRIENTS = ["saturated_fat_g", "sugars_g", "fiber_g", "sodium_mg", "cholesterol_mg", "water_ml"] as const;
const CARRIED_KEYS = NUTRIENT_KEYS.filter((k) => !(FORM_NUTRIENTS as readonly string[]).includes(k));

// Lo que el formulario NO edita pero tiene que devolver intacto al guardar. El PATCH del backend
// REEMPLAZA la fila entera (nutrientsToColumns escribe null explícito en lo ausente, a propósito),
// así que si esto no viaja de vuelta, corregirle una tilde al nombre de un alimento le borra las
// vitaminas y minerales que trajo de USDA.
type Carried = { sourceMicros: SourceMicros; usdaFdcId: number | null; micros: Partial<NutrientValues> };
const NO_CARRIED: Carried = { sourceMicros: null, usdaFdcId: null, micros: {} };

function carriedFrom(src: Partial<NutrientValues> & { sourceMicros?: SourceMicros; usdaFdcId?: number | null }): Carried {
  const micros: Record<string, number | null> = {};
  for (const k of CARRIED_KEYS) {
    const v = (src as Record<string, number | null | undefined>)[k];
    micros[k] = v ?? null;
  }
  return { sourceMicros: src.sourceMicros ?? null, usdaFdcId: src.usdaFdcId ?? null, micros };
}

type Form = {
  name: string; basis: FoodBasis; kcal: string; protein_g: string; carbs_g: string; fat_g: string;
  saturated_fat_g: string; sugars_g: string; fiber_g: string; salt_g: string;
  cholesterol_mg: string; water_ml: string;
  unitWeightG: string; sourceMacros: SourceMacros;
};
// El alta arranca en "manual": si el usuario no toca la IA, el dato lo está cargando él. Antes
// arrancaba en "estimate", que era el mismo valor que dejaba la IA — no se podían distinguir.
const EMPTY: Form = { name: "", basis: "per_100g", kcal: "", protein_g: "", carbs_g: "", fat_g: "", saturated_fat_g: "", sugars_g: "", fiber_g: "", salt_g: "", cholesterol_mg: "", water_ml: "", unitWeightG: "", sourceMacros: "manual" };

export default function AgregarAlimentoScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const baseUrl = useRef<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [carried, setCarried] = useState<Carried>(NO_CARRIED);
  const [foodText, setFoodText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { foodId } = useLocalSearchParams<{ foodId?: string }>();
  const [loading, setLoading] = useState(!!foodId);

  // ---- Estado del "¿no es este?" ----
  // `identification` es lo que hace posible corregir el match: la re-mezcla necesita la
  // identificación ENTERA (con su `searchQuery`, que no es un campo de FoodExtraction), así que
  // guardarla al prefillear no es un detalle — sin ella los candidatos no se pueden usar.
  // En modo edición queda en null: el alimento persistido no guarda `searchQuery`.
  const [identification, setIdentification] = useState<FoodIdentification | null>(null);
  const [candidatos, setCandidatos] = useState<UsdaEntry[]>([]);
  // La fila de USDA vigente, para nombrarla en el chip. En el alta sale de los candidatos; en
  // edición se resuelve por `getUsdaEntry` (el alimento solo persiste el id).
  const [entradaUsda, setEntradaUsda] = useState<UsdaEntry | null>(null);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [remezclando, setRemezclando] = useState(false);
  const [busquedaUsda, setBusquedaUsda] = useState("");
  const [resultadosUsda, setResultadosUsda] = useState<UsdaEntry[] | null>(null);
  const [buscandoUsda, setBuscandoUsda] = useState(false);

  useEffect(() => {
    (async () => {
      const url = await getBackendUrl();
      baseUrl.current = url;
      if (foodId) {
        try {
          // Un Food es un FoodExtraction con id y createdAt, así que el alimento guardado se carga
          // por el MISMO camino que lo que devuelve la IA: dos mapeos paralelos son dos lugares
          // donde olvidarse de un campo nuevo.
          const f = await getFood(url, foodId);
          prefillFrom(f);
          // La descripción de la entrada de USDA NO viaja con el alimento (que solo persiste el
          // `usdaFdcId`): se resuelve aparte, igual que en el detalle del catálogo. Va en su
          // propio catch porque es un adorno — si falla, el chip cae al id y la edición sigue.
          if (f.usdaFdcId != null) {
            try { setEntradaUsda(await getUsdaEntry(url, f.usdaFdcId)); } catch { /* el chip cae al id */ }
          }
        } catch (e) { setError((e as Error).message); }
      }
      setLoading(false);
    })();
  }, [foodId]);

  // Compartida por los TRES caminos que cargan valores (foto, texto y la re-mezcla del "¿no es
  // este?"), más la edición: el formulario tiene que quedar igual venga de donde venga.
  //
  // `setCarried` acá dentro es lo que hace que corregir el match sea seguro: `carried` lleva los
  // 24 micros que el formulario NO edita, y el PATCH reemplaza la fila entera. Si esta función
  // recargara los campos visibles y dejara el `carried` viejo, elegir otro candidato mostraría la
  // fila nueva en pantalla y persistiría las vitaminas de la anterior.
  function prefillFrom(ex: FoodExtraction, entrada?: UsdaEntry | null) {
    const numStr = (v: number | null | undefined) => (v == null ? "" : String(v));
    setForm({
      name: ex.name, basis: ex.basis, kcal: String(ex.kcal), protein_g: String(ex.protein_g),
      carbs_g: String(ex.carbs_g), fat_g: String(ex.fat_g),
      saturated_fat_g: numStr(ex.saturated_fat_g), sugars_g: numStr(ex.sugars_g),
      fiber_g: numStr(ex.fiber_g), salt_g: saltFieldFromSodiumMg(ex.sodium_mg),
      cholesterol_mg: numStr(ex.cholesterol_mg), water_ml: numStr(ex.water_ml),
      unitWeightG: ex.unitWeightG == null ? "" : String(ex.unitWeightG), sourceMacros: ex.sourceMacros,
    });
    setCarried(carriedFrom(ex));
    if (entrada !== undefined) setEntradaUsda(entrada);
  }

  // Lo que devuelven extract/describe: la extracción + los candidatos de USDA + la identificación
  // que el backend usó. Los tres llegan juntos y se guardan juntos.
  function prefillFromExtraction(res: FoodExtraction & { candidates?: UsdaEntry[]; identification?: FoodIdentification }) {
    const cands = res.candidates ?? [];
    setIdentification(res.identification ?? null);
    setCandidatos(cands);
    setCorrigiendo(false);
    setBusquedaUsda(""); setResultadosUsda(null);
    prefillFrom(res, cands.find((c) => c.fdcId === res.usdaFdcId) ?? null);
  }

  /** El usuario dijo "no es este" y eligió otra fila: se re-mezcla y se recarga TODO el form. */
  async function elegirEntradaUsda(entrada: UsdaEntry) {
    if (identification == null || !baseUrl.current) return;
    setError(null);
    setRemezclando(true);
    try {
      prefillFrom(await assembleUsdaFood(baseUrl.current, identification, entrada.fdcId), entrada);
      setCorrigiendo(false);
      // La búsqueda se limpia junto con el panel. Los candidatos filtran la entrada ya vigente,
      // pero los resultados no: si quedaran, al reabrir "¿no es este?" la fila recién elegida
      // seguiría clickeable y volvería a pedirle al backend la mezcla que ya está en pantalla.
      setBusquedaUsda(""); setResultadosUsda(null);
    } catch (e) {
      // El backend NO degrada a "sin micros" cuando el fdcId no existe, y acá tampoco: se avisa y
      // el formulario queda con la entrada que seguía vigente.
      setError((e as Error).message);
    } finally {
      setRemezclando(false);
    }
  }

  async function buscarEnUsda() {
    const q = busquedaUsda.trim();
    if (q.length < 2 || !baseUrl.current) return;
    setError(null);
    setBuscandoUsda(true);
    try {
      setResultadosUsda(await searchUsdaFoods(baseUrl.current, q));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuscandoUsda(false);
    }
  }

  async function describeAndPrefill() {
    setError(null);
    const text = foodText.trim();
    // El `disabled` del botón es lo que hoy bloquea esto de verdad; el guard queda como red por si
    // alguien llama al handler desde otro lado o saca el disabled.
    if (text.length < 2) return;
    if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
    setAnalyzing(true);
    try {
      prefillFromExtraction(await describeFood(baseUrl.current, text));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function pickAndExtract(source: "camera" | "library") {
    setError(null);
    const perm = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError("Necesito permiso de cámara/galería."); return; }
    const res = source === "camera"
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, mediaTypes: ["images"] });
    if (res.canceled || !res.assets[0]?.base64) return;
    const asset = res.assets[0];
    const mime = asset.mimeType && ["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType) ? asset.mimeType : "image/jpeg";
    if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
    setAnalyzing(true);
    try {
      prefillFromExtraction(await extractFood(baseUrl.current, asset.base64!, mime));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function save() {
    setError(null);
    const saltG = optNum(form.salt_g);
    const input = {
      // Los 24 micros que el formulario no edita van PRIMERO: son los que vienen de USDA y el
      // PATCH reemplaza la fila entera. Lo que sigue (los seis de etiqueta) es lo que el usuario
      // sí puede tocar, y pisa cualquier coincidencia.
      ...carried.micros,
      name: form.name.trim(), basis: form.basis, kcal: num(form.kcal), protein_g: num(form.protein_g),
      carbs_g: num(form.carbs_g), fat_g: num(form.fat_g),
      saturated_fat_g: optNum(form.saturated_fat_g), sugars_g: optNum(form.sugars_g),
      fiber_g: optNum(form.fiber_g), sodium_mg: sodiumMgFromField(form.salt_g),
      cholesterol_mg: optNum(form.cholesterol_mg), water_ml: optNum(form.water_ml),
      unitWeightG: form.unitWeightG.trim() === "" ? null : num(form.unitWeightG),
      sourceMacros: form.sourceMacros, sourceMicros: carried.sourceMicros, usdaFdcId: carried.usdaFdcId,
    };
    if (!input.name || [input.kcal, input.protein_g, input.carbs_g, input.fat_g].some((n) => Number.isNaN(n) || n < 0)) {
      setError("Completá nombre y macros (kcal/proteína/carbos/grasa) con números válidos."); return;
    }
    // Los micros son opcionales: si el usuario tipeó algo, tiene que ser un número >= 0.
    // La sal se valida en SAL, no en sodio: el mensaje de error tiene que hablar del campo que el
    // usuario ve. `saltG` es el valor crudo del campo, antes de convertir.
    for (const [label, v, raw] of [["saturadas", input.saturated_fat_g, form.saturated_fat_g], ["azúcares", input.sugars_g, form.sugars_g], ["fibra", input.fiber_g, form.fiber_g], ["sal", saltG, form.salt_g], ["colesterol", input.cholesterol_mg, form.cholesterol_mg], ["agua", input.water_ml, form.water_ml]] as const) {
      if (raw.trim() !== "" && (v == null || Number.isNaN(v) || v < 0)) { setError(`El valor de ${label} tiene que ser un número mayor o igual a 0.`); return; }
    }
    if (form.unitWeightG.trim() !== "" && (input.unitWeightG == null || Number.isNaN(input.unitWeightG) || input.unitWeightG <= 0)) {
      setError("El peso por unidad tiene que ser un número mayor a 0."); return;
    }
    if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
    setSaving(true);
    try {
      if (foodId) await updateFood(baseUrl.current, foodId, input);
      else await createFood(baseUrl.current, input);
      router.back();
    } catch (e) {
      setError((e as Error).message); setSaving(false);
    }
  }

  // El sodio que se va a guardar, derivado del campo de sal. Lo comparten el aviso "Sodio ≈ …" y
  // el semáforo.
  const sodiumMg = sodiumMgFromField(form.salt_g);

  const field = (label: string, key: keyof Form, keyboard: "default" | "numeric" = "default") => (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <TextInput
        value={form[key]} onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
        keyboardType={keyboard} placeholder={label} placeholderTextColor={colors.icon}
        style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }}
      />
    </View>
  );

  const chip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable onPress={onPress} style={{
      paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill,
      backgroundColor: active ? colors.accent : colors.surfaceMuted,
    }}>
      <Text style={{ color: active ? "#fff" : colors.text }}>{label}</Text>
    </Pressable>
  );

  // Una fila elegible de USDA. La descripción va en inglés, tal como la publica USDA: traducirla
  // impediría el chequeo que el usuario está haciendo justamente acá (ver "fried egg" →
  // "Fried eggplant", que es el error que este bloque existe para corregir).
  const filaUsda = (entrada: UsdaEntry, prefijo: string) => (
    <Pressable
      key={`${prefijo}-${entrada.fdcId}`}
      testID={`usda-${prefijo}-${entrada.fdcId}`}
      accessibilityRole="button"
      disabled={remezclando}
      onPress={() => void elegirEntradaUsda(entrada)}
      style={{ paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}
    >
      <Text style={{ color: colors.text, fontSize: 13 }}>{entrada.description}</Text>
    </Pressable>
  );

  // De qué fila de USDA salieron las vitaminas y los minerales, y cómo cambiarla.
  //
  // El "¿no es este?" SOLO aparece cuando hay `identification` (alta por foto o texto). En modo
  // edición el alimento persistido no guarda `searchQuery`, así que no hay con qué re-mezclar:
  // el chip informa, y corregir el match se hace dando de alta de nuevo.
  const puedeCorregir = identification != null;
  const bloqueUsda = (carried.usdaFdcId != null || puedeCorregir) && (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
        {carried.usdaFdcId != null ? (
          <Text testID="usda-chip" style={{ color: colors.icon, fontSize: 12, flexShrink: 1 }}>
            {`USDA · ${entradaUsda?.description ?? `entrada ${carried.usdaFdcId}`}`}
          </Text>
        ) : (
          <Text testID="usda-sin-match" style={{ color: colors.icon, fontSize: 12, flexShrink: 1 }}>
            Sin vitaminas ni minerales de USDA
          </Text>
        )}
        {puedeCorregir && (
          <Pressable testID="usda-no-es-este" accessibilityRole="button" onPress={() => setCorrigiendo((v) => !v)}>
            <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "600" }}>
              {carried.usdaFdcId != null ? "¿no es este?" : "elegir a mano"}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Arranca cerrado: son hasta 8 filas en inglés, y la mayoría de las veces el match está
          bien. Se abre solo cuando el usuario dice que no. */}
      {corrigiendo && puedeCorregir && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Elegí la entrada de USDA que corresponde. Los valores del formulario se recargan con esa fila.
          </Text>
          {/* La vigente no se lista: "¿no es este?" es la lista de las OTRAS, y volver a elegir la
              misma sería una llamada al backend que no cambia nada. */}
          {candidatos.filter((c) => c.fdcId !== carried.usdaFdcId).map((c) => filaUsda(c, "candidato"))}

          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.md }}>¿No está el que buscás?</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
            <TextInput
              testID="usda-buscar-input"
              value={busquedaUsda}
              onChangeText={setBusquedaUsda}
              placeholder="Buscar en USDA (en inglés)"
              placeholderTextColor={colors.icon}
              style={{ flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text }}
            />
            <Pressable
              testID="usda-buscar-submit"
              onPress={() => void buscarEnUsda()}
              disabled={buscandoUsda || busquedaUsda.trim().length < 2}
              style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingHorizontal: spacing.md, justifyContent: "center", opacity: buscandoUsda || busquedaUsda.trim().length < 2 ? 0.5 : 1 }}
            >
              <Text style={{ color: colors.accentText, fontWeight: "600", fontSize: 13 }}>Buscar</Text>
            </Pressable>
          </View>
          {/* `null` = todavía no se buscó; `[]` = se buscó y no hubo nada. Un "sin resultados"
              mostrado antes de buscar diría que USDA no tiene el alimento, que es otra cosa. */}
          {resultadosUsda != null && resultadosUsda.length === 0 && !buscandoUsda && (
            <Text testID="usda-sin-resultados" style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.sm }}>
              No hay entradas de USDA para esa búsqueda.
            </Text>
          )}
          {(resultadosUsda ?? []).map((c) => filaUsda(c, "resultado"))}
          {remezclando && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.sm }} />}
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>Cargando alimento…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>{foodId ? "Editar alimento" : "Agregar alimento"}</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <TextInput
          testID="food-text-input"
          value={foodText}
          onChangeText={setFoodText}
          placeholder="Escribí un alimento (p.ej. almendra)"
          placeholderTextColor={colors.icon}
          style={{ flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }}
        />
        <Pressable
          testID="food-text-submit"
          onPress={describeAndPrefill}
          disabled={analyzing || foodText.trim().length < 2}
          style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: spacing.md, justifyContent: "center", opacity: analyzing || foodText.trim().length < 2 ? 0.5 : 1 }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Buscar</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Pressable onPress={() => pickAndExtract("camera")} style={{ flex: 1, backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>📷 Foto</Text>
        </Pressable>
        <Pressable onPress={() => pickAndExtract("library")} style={{ flex: 1, backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: colors.accentText, fontWeight: "600" }}>🖼️ Galería</Text>
        </Pressable>
      </View>
      {analyzing && (
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
          <ActivityIndicator color={colors.accent} /><Text style={{ color: colors.textMuted }}>Analizando…</Text>
        </View>
      )}
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}

      {form.name.trim() !== "" && <SourceChip sourceMacros={form.sourceMacros} sourceMicros={carried.sourceMicros} />}
      {field("Nombre", "name")}
      {bloqueUsda}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {chip("Sólido (100g)", form.basis === "per_100g", () => setForm((f) => ({ ...f, basis: "per_100g" })))}
        {chip("Líquido (100ml)", form.basis === "per_100ml", () => setForm((f) => ({ ...f, basis: "per_100ml" })))}
      </View>
      {field(`Calorías (por 100${form.basis === "per_100ml" ? "ml" : "g"})`, "kcal", "numeric")}
      {field("Proteína (g)", "protein_g", "numeric")}
      {field("Carbohidratos (g)", "carbs_g", "numeric")}
      {field("Grasa (g)", "fat_g", "numeric")}
      {field("Grasas saturadas (g, opcional)", "saturated_fat_g", "numeric")}
      {field("Azúcares (g, opcional)", "sugars_g", "numeric")}
      {field("Fibra (g, opcional)", "fiber_g", "numeric")}
      {field("Sal (g, opcional)", "salt_g", "numeric")}
      {/* Lo que se guarda es este número, no los gramos de sal: por eso se muestra. */}
      {sodiumMg != null && sodiumMg >= 0 && (
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Sodio ≈ {sodiumMg} mg / 100{form.basis === "per_100ml" ? "ml" : "g"}
        </Text>
      )}
      {field(`Colesterol (mg, opcional)`, "cholesterol_mg", "numeric")}
      {field(`Agua (ml por 100${form.basis === "per_100ml" ? "ml" : "g"}, opcional)`, "water_ml", "numeric")}
      {field("Peso por unidad (opcional)", "unitWeightG", "numeric")}

      {/* Spec: la vista "full" del semáforo vive solo en modo edición. En alta, `fat_g` recién
          escrito puede ser "" — y `num("")` da 0, no NaN — así que mostrarla acá pintaría
          "grasa 0 g · ok" en un formulario vacío. En edición el valor arrancó cargado desde el
          alimento guardado, pero si el usuario lo borra a mano volvemos a tener "" → 0: por eso
          acá (y solo acá, `fat_g` sigue siendo obligatorio para guardar) mandamos NaN en vez de
          0 cuando está vacío. `FoodFlagsInput.fat_g` pide `number` — NaN lo satisface — y
          nutrientLevel/NutrientFlags ya tratan NaN como "sin dato", nunca como "bajo". */}
      {foodId && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontWeight: "600", fontSize: 13 }}>Semáforo nutricional</Text>
          <NutrientFlags
            variant="full"
            food={{
              basis: form.basis,
              fat_g: form.fat_g.trim() === "" ? NaN : num(form.fat_g),
              saturated_fat_g: optNum(form.saturated_fat_g),
              sugars_g: optNum(form.sugars_g),
              // El semáforo razona en SAL pero pide SODIO (ver FoodFlagsInput): la conversión es
              // la misma que la del guardado, así que el chip no puede juzgar un valor distinto
              // del que se persiste.
              sodium_mg: sodiumMg,
              cholesterol_mg: optNum(form.cholesterol_mg),
              fiber_g: optNum(form.fiber_g),
            }}
          />
        </View>
      )}

      <Pressable onPress={save} disabled={saving} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Guardando…" : foodId ? "Guardar cambios" : "Guardar en el catálogo"}</Text>
      </Pressable>
    </ScrollView>
  );
}
