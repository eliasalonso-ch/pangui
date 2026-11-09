/**
 * Diccionario de cobros: lo que escribe el maestro en la hoja → código(s) del
 * catálogo de Patricio. Reglas por familia y no por texto exacto, porque la
 * misma caja sale escrita "caja chuky", "2 uni cajas chuqui", "caja chucky".
 *
 * Armado cruzando las hojas de Pangui (jul–nov 2026) con los códigos que puso
 * Claudio en los Excel ya revisados. Cada regla PROPONE un código y sólo vale
 * si existe en el catálogo: un código mal adivinado es plata mal cobrada, uno
 * en blanco sólo es una celda por llenar. Ante la duda, null.
 */

/** Texto ya pasado por norm() (minúsculas, sin tildes). */
type Regla = (t: string, ok: (c: string) => string | undefined) => (string | undefined)[] | null | undefined;

const dec = (s: string) => s.replace(".", ","); // 2.5 → "2,5" como en los códigos
const watts = (t: string) => t.match(/(\d+)\s*w\b/)?.[1];
const mm = (t: string) => t.match(/(\d+)\s*(?:mm|m\.m)\b/)?.[1] ?? t.match(/\b(16|20|25|32|40|50|63)\b/)?.[1];
const polosAmp = (t: string) => t.match(/\b([1-4])\s*[x/]\s*(\d+)/);
const amp = (t: string) => t.match(/\b(\d+)\s*a\b/)?.[1];
const primero = (ok: (c: string) => string | undefined, ...cs: string[]) => cs.map(ok).find(Boolean);

// Orden importa: lo más específico primero (horario/diferencial antes que interruptor,
// caja antes que emt, soporte y tapa antes que bandeja).
const REGLAS: Regla[] = [
  // Lo que no trae material: arreglar no es instalar uno nuevo.
  (t) => (/^(reparacion|revision|retiro|desmontaje|limpieza)\b/.test(t) ? null : undefined),
  // Accesorios y equipos completos: la palabra "emt" o "tubo" no los hace tubería.
  (t) => (/\b(coplas?|curvas?|bushing|abrazaderas?|equipos?|modulo)\b/.test(t) ? null : undefined),
  (t) => (/tapas? ciegas?/.test(t) ? [/magic/.test(t) ? "tapciemag" : "tapcie"] : undefined), // antes que soporte: "tapa ciega con soporte"

  (t) => (/apoyo en altura/.test(t) ? ["AA"] : undefined),
  (t) => (/pruebas? de funcionamiento/.test(t) ? ["prufun"] : undefined),
  (t) => (/andamio/.test(t) ? ["And"] : undefined),
  (t) => (/alza ?-?hombre|brazo articulado/.test(t) ? ["braart16m"] : undefined),
  (t) => (/migracion/.test(t) ? ["mig"] : undefined),
  (t) => (/pasadas? de muro/.test(t) ? ["pasmur"] : undefined),
  (t) => (/ip ?68/.test(t) ? ["conip68"] : undefined),
  (t) => (/falsos? ?polos?/.test(t) ? ["falpol"] : undefined),
  // "fotocelda" a secas: Claudio a veces cobra fotbas y a veces fot, no hay regla segura.
  (t) => (/fotocelda/.test(t) ? (/con base/.test(t) ? ["fotbas"] : /sin base/.test(t) ? ["fot"] : null) : undefined),
  (t) => (/rj ?45/.test(t) ? [/hembra/.test(t) ? "conrj45hemvol" : /macho/.test(t) ? "conrj45macvol" : undefined] : undefined),

  (t) => (/\bcajas? (?:de )?(?:emt )?chuqui/.test(t) ? [/metal|zinc|galv|emt/.test(t) ? "cajchuzin" : "cajpla"] : undefined),

  (t) => {
    if (!/interruptor(es)? horario|reloj/.test(t)) return;
    return ["INTHOR16"];
  },
  (t) => {
    if (!/diferencial/.test(t)) return;
    const m = polosAmp(t);
    return [`DIF${m?.[1] ?? 2}x${m?.[2] ?? 25}AC`];
  },
  (t) => {
    if (!/\b(automaticos?|itm|termomagnetic[oa]s?|proteccion(es)?)\b/.test(t)) return;
    const m = polosAmp(t);
    const a = m?.[2] ?? amp(t);
    return a ? [`ITM${m?.[1] ?? 1}x${a}C`] : null;
  },
  (t) => {
    if (!/\binterruptor(es)?\b/.test(t)) return;
    const pa = polosAmp(t); // "interruptor 4x25" es un automático
    if (pa) return [`ITM${pa[1]}x${pa[2]}C`];
    const mag = /magic/.test(t) ? "mag" : "";
    if (/doble/.test(t)) return [`intdob${mag}`];
    if (/triple/.test(t)) return [`inttri${mag}`];
    if (/9\/24/.test(t)) return [`intsim924${mag}`];
    return [`intsim${mag}`]; // "interruptor", "simple", "9/12": Claudio pone intsim
  },
  (t, ok) => {
    if (!/\b(enchufes?|ench)\b/.test(t)) return;
    if (/industrial|volante|hembra|macho|schuko|chuko|idrobox|seguridad|trifasic|32\s*a\b/.test(t)) return null;
    const tipo = /triple/.test(t) ? "tri" : /doble/.test(t) ? "dob" : /simple/.test(t) || amp(t) ? "sim" : null;
    if (!tipo) return null;
    const a = /\b16\s*a?\b/.test(t) && !/10\s*\/\s*16/.test(t) ? 16 : 10;
    return [ok(`enc${tipo}${a}${/magic/.test(t) ? "mag" : /mosaic/.test(t) ? "mos" : ""}`)];
  },

  (t) => {
    if (!/\bcables?\b/.test(t) || /utp|red|coaxial|desnudo|superflex|awg|rz1|rv-?k|cordon/.test(t)) return;
    const s = t.match(/\b(1\.5|2\.5|4|6)\s*(?:mm2?|mm²)?\b/)?.[1];
    return s ? [`Cab${dec(s)}eva`] : null;
  },
  (t, ok) => {
    if (!/cordon/.test(t)) return;
    const m = t.match(/\b([23])\s*x\s*(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const base = `COR${m[1]}x${dec(m[2])}`;
    return [/rz1/.test(t) ? ok(`${base}rz1`) : primero(ok, base, `${base}bla`)];
  },

  (t) => {
    if (!/soportes?/.test(t)) return;
    if (/universal|zoloda/.test(t)) return ["sopuni10050"];
    if (/matix/.test(t)) return ["sopmat"];
    if (/magic/.test(t)) return ["sopmag"];
    return null;
  },
  (t) => {
    if (!/tapas? (?:de )?(extremo|termino|final)/.test(t)) return;
    const m = t.match(/(\d+)\s*x\s*(\d+)/);
    return m ? [`tapext${m[1]}${m[2]}`] : null;
  },
  (t) => {
    if (!/bandeja|moldura|\bdlp\b|\btee\b/.test(t) || /bpc|ranurada/.test(t)) return;
    const m = t.match(/(\d+)\s*[x/]\s*(\d+)/);
    // "50x100" y "100/50" son la misma: el código va con la medida grande primero.
    const med = m ? [m[1], m[2]].sort((a, b) => Number(b) - Number(a)).join("") : /\bdlp\b|20\s*mm/.test(t) ? "2010" : null;
    if (/\btee\b/.test(t)) return med ? [`Tee${med}`] : null;
    if (!med) return null;
    return [`mol${med}${/libre halogeno|\blh\b/.test(t) ? "lh" : /adhesiv/.test(t) ? "adh" : ""}`];
  },

  (t) => {
    if (!/panel/.test(t)) return;
    const m = t.match(/\b(30|60|120)\s*[x/]\s*(30|60|120)\b/);
    if (!m) return null;
    const [a, b] = [m[1], m[2]].sort((x, y) => Number(x) - Number(y)); // "120x30" = 30x120
    const temp = /calido|3000|2700/.test(t) ? 3000 : /neutro|4000|4500/.test(t) ? 4000 : 6000;
    // Claudio cobra el panel embutido y, si va sobrepuesto, aparte la base.
    return [`panled${a}${b}${temp}emb`, ...(/embutid/.test(t) ? [] : [`baspan${a}${b}`])];
  },
  (t) => {
    if (!/\btubos?\b/.test(t) || /emt|lh|libre|pvc|galv/.test(t)) return;
    if (/fluorescente/.test(t)) return ["TUBled36FLUO"];
    const w = watts(t);
    return w ? [`TUBled${w}`] : null;
  },
  (t) => {
    if (!/plafon/.test(t)) return;
    const w = watts(t);
    return w ? [`pla${w}`] : null;
  },
  (t, ok) => {
    if (!/proyector/.test(t)) return;
    const w = watts(t);
    if (!w) return null;
    return [/sensor/.test(t) ? ok(`pro${w}sen`) : primero(ok, `pro${w}6000`, `pro${w}6500SOB`, `pro${w}`)];
  },
  (t) => {
    if (!/luz piloto|luces piloto/.test(t)) return;
    if (/triple|trifasic/.test(t)) return ["luzpiltri"];
    if (/riel|monofasic/.test(t)) return ["luzpilrie"];
    if (/roj/.test(t)) return ["luzpilroj"];
    if (/verde/.test(t)) return ["luzpilver"];
    if (/amarill/.test(t)) return ["luzpilama"];
    return null;
  },

  (t) => {
    const m = t.match(/(tetrapolar|bipolar)\s*(?:de\s*)?(\d+)\s*(?:pines|posiciones|puestos|polos)?/);
    if (!m) return;
    return [m[1] === "tetrapolar" ? `reptet125${m[2]}` : `repbip100${m[2]}`];
  },
  (t) => {
    if (!/barra (de )?neutro|regleta/.test(t)) return;
    const n = t.match(/\b(6|12)\b/)?.[1];
    if (!n) return null;
    return [`${/tierra|verde/.test(t) ? "regtie" : /azul/.test(t) ? "regazu" : "regbla"}${n}`];
  },
  (t) => (/porta ?fusibles?/.test(t) ? [/nh|cavanna/.test(t) ? "porfuscav" : "porfus"] : undefined),
  (t) => {
    if (!/tableros? plastico/.test(t)) return;
    const n = t.match(/(\d+)\s*modulos/)?.[1];
    return n ? [`tabpla${n}sob`] : null;
  },
  (t) => {
    if (!/amarras?/.test(t)) return;
    const n = t.match(/\b(100|200|300)\b/)?.[1];
    return n ? [`amapla${n}`] : null;
  },
  (t) => {
    if (!/borneras?/.test(t)) return;
    const s = t.match(/\b(2\.5|4|6|10|16)\s*mm/)?.[1];
    return s ? [`bor${dec(s)}${/verde/.test(t) ? "v" : "g"}`] : null;
  },

  // Tuberías y accesorios por diámetro.
  (t) => (/flexible/.test(t) && mm(t) ? [`Fle${mm(t)}`] : undefined),
  (t) => (/conector(es)? rectos?/.test(t) && mm(t) ? [`Conrec${mm(t)}`] : undefined),
  (t) => (/terminal(es)? hub/.test(t) && mm(t) ? [`terhub${mm(t)}`] : undefined),
  (t) => (/\bemt\b/.test(t) && mm(t) ? [`emt${mm(t)}`] : undefined),
  (t) => (/libre halogeno|\blh\b/.test(t) && /tuberia|tira/.test(t) && mm(t) ? [`LH${mm(t)}`] : undefined),
  (t) => (/galvanizad|\bcag\b/.test(t) && /tuberia|tira|cag/.test(t) && mm(t) ? [`gal${mm(t)}`] : undefined),
  (t) => {
    const n = t.match(/\bpg\s*(11|13|13\.5|16|21)\b/)?.[1];
    return n ? [n.startsWith("13") ? "pg13,5" : `pg${n}`] : undefined;
  },
];

/**
 * Códigos sugeridos para una línea de la hoja, o null si no hay una regla segura.
 * `ok` devuelve el código tal como está en el catálogo (o undefined si no existe).
 */
export function codigosDeTexto(textoNorm: string, ok: (c: string) => string | undefined): string[] | null {
  const t = textoNorm
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\b(chuky|chucky|chuki|chukis|chuquis|chuqi)\b/g, "chuqui")
    .replace(/^\d+(?:\.\d+)?\s*(?:un|uni|unid|unidad(?:es)?|und|u|mts?|metros?|m|tiras?)?\.?\s+/, "");
  for (const regla of REGLAS) {
    const r = regla(t, ok);
    if (r === undefined) continue;
    if (r === null) return null;
    const codigos = r.map((c) => (c ? ok(c) : undefined));
    return codigos.length && codigos.every(Boolean) ? (codigos as string[]) : null;
  }
  return null;
}
