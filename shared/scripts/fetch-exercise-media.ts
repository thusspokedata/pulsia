#!/usr/bin/env bun
/**
 * Ingesta de las ilustraciones de Everkinetic (CC-BY-SA-4.0).
 *
 * Baja los dos cuadros de cada ejercicio mapeado en exerciseMedia.slugs.ts, los convierte a
 * WebP y escribe:
 *   - mobile/assets/exercises/<id_num>-<relaxation|tension>.webp
 *   - shared/src/catalog/exerciseMedia.data.ts   (frames + cues traducidos)
 *   - shared/src/catalog/media.lock.json         (revisión + hash de cada asset)
 *
 * Correr desde la raíz:  bun run shared/scripts/fetch-exercise-media.ts
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import sharp from "sharp";
import { EXERCISE_MEDIA_SLUGS } from "../src/catalog/exerciseMedia.slugs";

// Revisión FIJA. Nunca apuntar a una rama: el repo puede cambiar de licencia o reemplazar
// imágenes sin aviso, y nosotros redistribuimos ese contenido.
const REV = "6f3ce86eb79b17e7bbaf588b7960149725bc8fc7";
const RAW = `https://raw.githubusercontent.com/everkinetic/data/${REV}`;

const OUT_ASSETS = resolve(import.meta.dir, "../../mobile/assets/exercises");
const OUT_DATA = resolve(import.meta.dir, "../src/catalog/exerciseMedia.data.ts");
const OUT_LOCK = resolve(import.meta.dir, "../src/catalog/media.lock.json");

interface EkExercise {
  name: string;
  id_num: string;
  steps?: string[];
}

async function getBuffer(path: string): Promise<Buffer | null> {
  const res = await fetch(`${RAW}/${path}`);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  // 1. Licencia: si el upstream dejó de ser CC-BY-SA, abortamos.
  const license = await getBuffer("LICENSE.md");
  if (!license || !license.toString("utf-8").includes("Attribution-ShareAlike 4.0")) {
    throw new Error(
      "El LICENSE.md del upstream ya no dice Attribution-ShareAlike 4.0. " +
        "Parar y revisar antes de redistribuir nada.",
    );
  }

  // 2. Índice de ejercicios de la fuente.
  const raw = await getBuffer("exercises.json");
  if (!raw) throw new Error("No se pudo bajar exercises.json");
  const ek: EkExercise[] = JSON.parse(raw.toString("utf-8"));
  const bySlug = new Map(ek.map((e) => [e.name, e]));

  mkdirSync(OUT_ASSETS, { recursive: true });

  const data: Record<string, { frames: [string, string]; cues: string[] }> = {};
  const lock: Record<string, string> = {};
  const sinAssets: string[] = [];
  const sinSlug: string[] = [];
  const pendientes: Array<{ keys: [string, string]; bufs: [Buffer, Buffer] }> = [];

  for (const [catalogId, slug] of Object.entries(EXERCISE_MEDIA_SLUGS)) {
    const e = bySlug.get(slug);
    if (!e) {
      sinSlug.push(`${catalogId} → ${slug}`);
      continue;
    }

    // dist/png es la fuente preferida; src/images-ai es el fallback (mismos dos cuadros,
    // otro naming, mayor resolución). Verificado visualmente que F/S == relaxation/tension.
    const candidatos: Array<[string, string]> = [
      [`dist/png/${e.id_num}-relaxation.png`, `dist/png/${e.id_num}-tension.png`],
      [`src/images-ai/${e.id_num}-F.ai.png`, `src/images-ai/${e.id_num}-S.ai.png`],
    ];

    let bufs: [Buffer, Buffer] | null = null;
    for (const [a, b] of candidatos) {
      const [ba, bb] = await Promise.all([getBuffer(a), getBuffer(b)]);
      if (ba && bb) {
        bufs = [ba, bb];
        lock[a] = createHash("sha256").update(ba).digest("hex");
        lock[b] = createHash("sha256").update(bb).digest("hex");
        break;
      }
    }

    if (!bufs) {
      sinAssets.push(`${catalogId} → ${slug} (id_num ${e.id_num})`);
      continue;
    }

    const keys: [string, string] = [`${e.id_num}-relaxation`, `${e.id_num}-tension`];
    // NO escribimos todavía: primero se valida la integridad de TODO lo bajado (paso 3).
    // Escribir dentro del loop haría que la guarda llegue tarde y deje el directorio a medias.
    pendientes.push({ keys, bufs });
    data[catalogId] = { frames: keys, cues: e.steps ?? [] };
  }

  // 3. Guarda de integridad: comparar contra el lock commiteado.
  //    Con la revisión fijada por SHA el upstream no puede cambiar, así que lo que esto
  //    atrapa es (a) una descarga corrupta o truncada, y (b) que alguien bumpee REV sin
  //    darse cuenta de que además cambiaron los dibujos. En el caso (b) el diff del lock
  //    dice exactamente qué cambió.
  if (existsSync(OUT_LOCK)) {
    const previo = JSON.parse(readFileSync(OUT_LOCK, "utf-8")) as {
      revision: string;
      assets: Record<string, string>;
    };
    const difieren = Object.entries(lock).filter(
      ([path, hash]) => previo.assets[path] && previo.assets[path] !== hash,
    );
    if (difieren.length > 0 && previo.revision === REV) {
      throw new Error(
        `${difieren.length} asset(s) bajaron con un hash distinto al del lock, con la MISMA revisión ` +
          `(${REV.slice(0, 7)}). Eso es una descarga corrupta, no un cambio legítimo:\n  ` +
          difieren.map(([p]) => p).join("\n  ") +
          `\nReintentá. Si persiste, revisá la fuente antes de escribir nada.`,
      );
    }
    if (previo.revision !== REV) {
      console.log(
        `\n⚠️  La revisión cambió (${previo.revision.slice(0, 7)} → ${REV.slice(0, 7)}). ` +
          `${difieren.length} asset(s) cambiaron de contenido. Revisá el diff del lock antes de commitear.`,
      );
    }
  }

  // 4. Recién ahora, validado todo, se escriben los assets.
  for (const { keys, bufs } of pendientes) {
    for (let i = 0; i < 2; i++) {
      const webp = await sharp(bufs[i])
        .resize(480, 480, { fit: "inside" })
        .webp({ quality: 82 })
        .toBuffer();
      writeFileSync(resolve(OUT_ASSETS, `${keys[i]}.webp`), webp);
    }
  }

  // 5. Escribir los datos. Los cues quedan en INGLÉS acá; los traduce la Tarea 3.
  const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
  const lines = [
    "// AUTO-GENERADO por scripts/fetch-exercise-media.ts — no editar a mano.",
    "// Ilustraciones de Everkinetic (CC-BY-SA-4.0), revisión " + REV.slice(0, 7) + ".",
    'import type { ExerciseMedia } from "./exerciseMedia";',
    "",
    "export const EXERCISE_MEDIA_DATA: Record<string, ExerciseMedia> = {",
    ...entries.map(
      ([id, m]) =>
        `  ${id}: {\n` +
        `    frames: ["${m.frames[0]}", "${m.frames[1]}"],\n` +
        `    cues: [${m.cues.map((c) => JSON.stringify(c)).join(", ")}],\n` +
        `  },`,
    ),
    "};",
    "",
  ];
  writeFileSync(OUT_DATA, lines.join("\n"), "utf-8");
  writeFileSync(OUT_LOCK, JSON.stringify({ revision: REV, assets: lock }, null, 2), "utf-8");

  console.log(`\nCon animación: ${entries.length}`);
  console.log(`Sin assets en el upstream: ${sinAssets.length}`);
  sinAssets.forEach((s) => console.log(`   ${s}`));
  if (sinSlug.length) {
    console.log(`\n⚠️  Slugs que no existen en exercises.json: ${sinSlug.length}`);
    sinSlug.forEach((s) => console.log(`   ${s}`));
  }
}

await main();
