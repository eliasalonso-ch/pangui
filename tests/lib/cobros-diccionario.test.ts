import { describe, expect, it } from "vitest";
import { codigosDeTexto } from "@/lib/cobros-diccionario";
import { norm } from "@/lib/cobros-excel";

// Un pedazo del catálogo de Patricio, con sus mayúsculas tal cual.
const CODIGOS = ["cajpla", "cajchuzin", "enctri10", "encsim10", "encdob10", "enctri10mos", "intsim", "ITM1x16C", "ITM4x25C",
  "DIF2x25AC", "Cab2,5eva", "COR3x2,5", "COR3x0,75bla", "mol2010", "mol10050", "Tee10050", "tapcie", "tapext10050",
  "panled301206000emb", "panled301204000emb", "baspan30120", "panled601206000emb", "baspan60120", "TUBled18", "pla18",
  "pro1006000", "pro150", "pro1506500SOB", "reptet1257", "regbla12", "porfus", "tabpla42sob", "Fle20", "Conrec20",
  "emt20", "LH20", "pg13,5", "conip68", "pasmur", "AA", "sopuni10050", "fotbas", "fot"];
const mapa = new Map(CODIGOS.map((c) => [norm(c), c]));
const sugerir = (t: string) => codigosDeTexto(norm(t), (c) => mapa.get(norm(c)));

describe("codigosDeTexto: texto del maestro → código de Patricio", () => {
  it.each([
    // Casos reales de las hojas de jul–oct 2026, con el código que puso Claudio.
    ["2 uni caja chuqui", ["cajpla"]],
    ["cajas chucky", ["cajpla"]],
    ["1 caja emt chuky", ["cajchuzin"]],
    ["enchufe triple stanford", ["enctri10"]],
    ["2 enchufe 10a", ["encsim10"]],
    ["enchufe triple mosaic 10/16a", ["enctri10mos"]],
    ["interruptor 9/12", ["intsim"]],
    ["1 interruptor 4x25", ["ITM4x25C"]],
    ["automatico 16a", ["ITM1x16C"]],
    ["proteccion diferencial 2x25x30ma", ["DIF2x25AC"]],
    ["45 metros cable 2.5", ["Cab2,5eva"]],
    ["cable h07z1k 2,5mm", ["Cab2,5eva"]],
    ["cordon 3x2,5", ["COR3x2,5"]],
    ["cordon 3x0,75", ["COR3x0,75bla"]],
    ["4 m bandeja dlp 20x10", ["mol2010"]],
    ["bandeja zoloda 50x100", ["mol10050"]],
    ["tee zoloda 100x50", ["Tee10050"]],
    ["tapa ciega con soporte", ["tapcie"]],
    ["tapa de termino zoloda 100x50", ["tapext10050"]],
    ["panel led 30x120 embutido", ["panled301206000emb"]],
    ["1 panel de 60/120 frio sobrepuesto", ["panled601206000emb", "baspan60120"]],
    ["1 uni panel 60x120 sobrepuesto frio", ["panled601206000emb", "baspan60120"]],
    ["sobrepuesto paneles led neutro 30x120", ["panled301204000emb", "baspan30120"]],
    ["2 un tubo led 6500k 18w", ["TUBled18"]],
    ["plafon 18w frio embutido", ["pla18"]],
    ["proyector de 100w", ["pro1006000"]],
    ["proyector 150w", ["pro1506500SOB"]],
    ["barra tetrapolar 7 pines", ["reptet1257"]],
    ["1 unidad barra neutro 12 puestos", ["regbla12"]],
    ["portafusibles 10x38", ["porfus"]],
    ["tablero plastico sobrepuesto solera 42 modulos", ["tabpla42sob"]],
    ["1 m flexible 20mm", ["Fle20"]],
    ["2 un conectores rectos 20mm", ["Conrec20"]],
    ["1 tira tuberia emt 20mm", ["emt20"]],
    ["tuberia lh de 20mm", ["LH20"]],
    ["2 pg13", ["pg13,5"]],
    ["3 uni prensa ip68", ["conip68"]],
    ["pasadas de muro", ["pasmur"]],
    ["apoyo en altura con escala", ["AA"]],
    ["soporte universal zoloda", ["sopuni10050"]],
    ["fotocelda con base", ["fotbas"]],
  ])("%s → %j", (texto, esperado) => {
    expect(sugerir(texto)).toEqual(esperado);
  });

  it.each([
    "reparacion de enchufe triple", // arreglar no es instalar uno nuevo
    "copla emt 20mm",               // accesorio, no tubería
    "equipo stanco 2x18w + tubos frios",
    "enchufe trifasico sobrepuesto de 32a",
    "fotocelda",                     // Claudio cobra a veces fotbas, a veces fot
    "cable eva",                     // sin sección
    "sello", "caja mec", "rotulado", // no se cobran
    "proyector 70w",                 // la regla arma pro70, pero no está en este catálogo
  ])("%s → sin sugerencia", (texto) => {
    expect(sugerir(texto)).toBeNull();
  });
});
