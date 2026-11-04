import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx-js-style";
import type { XlsxHoja } from "@/lib/hoja-excel";
import { lineasDeOt, pestanaCobros, libroCobros, leerPrecios, leerExcelCobros, otsNuevas, type OtCobro, type HojaCobro } from "@/lib/cobros-excel";

const X = XLSX as unknown as XlsxHoja;
const COLS = [{ id: "a", label: "Ítem" }, { id: "b", label: "Cantidad" }, { id: "c", label: "Unidad" }];
// Filas como "ítem|cantidad|unidad", igual que en las hojas reales de julio.
const hoja = (tipo: string, ...filas: string[]): HojaCobro => ({
  tipo,
  columnas: COLS,
  filas: filas.map((f) => { const [a, b, c] = f.split("|"); return { a, b, c }; }),
});
const ot = (hojas: HojaCobro[], extra: Partial<OtCobro> = {}): OtCobro => ({
  numeroOt: "SF920260627830", solicitante: "", lugar: "Cabina 2", fecha: "2026-06-19",
  descripcion: "Instalar 3 proyectores", emergencia: false, hojas, ...extra,
});
const catalogo = new Map([["tubo led 18w", "tubled18"], ["apoyo en altura", "AA"]]);
const manoObra = (o: OtCobro) => lineasDeOt(o, catalogo)[0];

describe("lineasDeOt: mano de obra = personas × hh (regla de Claudio)", () => {
  it.each([
    ["|2|hh", "|2|pp", 4],                      // …803
    ["Hh|4|", "Personas|2|", 8],                // …804
    ["HH |1,5|Horas", "PP|2|Personas", 4],      // …948: 1,5hh se cobra como 2hh
    ["Escalera telescópica |2|hh", "|2|pp", 4], // …844
    ["Hh|2|Hr", "Persona |2|", 4],              // …909
  ])("%s + %s → %d", (a, b, esperado) => {
    expect(manoObra(ot([hoja("materiales_usados", a, b)]))).toEqual({ texto: "Revisión normal", codigo: "revnor", cantidad: esperado });
  });

  it("lee \"1 hh 2 personas\" escrito de corrido en una celda", () => {
    expect(manoObra(ot([hoja("materiales_usados", "Cobrar 1 hh 2 personas ||")]))?.cantidad).toBe(2);
    expect(manoObra(ot([hoja("general", "2 hh 2 personas ||")]))?.cantidad).toBe(4);
  });

  it("SIN OT es emergencia salvo que se diga otra cosa", () => {
    expect(manoObra(ot([hoja("materiales_usados", "|1|hh", "|2|pp")], { numeroOt: "" }))?.codigo).toBe("reveme");
  });

  it("emergencia usa reveme", () => {
    expect(manoObra(ot([hoja("materiales_usados", "|1|hh", "|2|pp")], { emergencia: true })))
      .toEqual({ texto: "Revisión de emergencia", codigo: "reveme", cantidad: 2 });
  });

  it("sin hh en la hoja usa el cronómetro de la app: < 60 min es 1hh, y así", () => {
    const conApp = (min: number) => manoObra(ot([hoja("materiales_usados", "|2|pp")], { minutosApp: min }))?.cantidad;
    expect(conApp(12)).toBe(2);   // 1hh × 2 personas
    expect(conApp(60)).toBe(2);
    expect(conApp(61)).toBe(4);   // 2hh × 2
    expect(conApp(150)).toBe(6);  // 3hh × 2
    // la hoja manda: …844 decía 2hh y la app marcó 54 min
    expect(manoObra(ot([hoja("materiales_usados", "|2|hh", "|2|pp")], { minutosApp: 54 }))?.cantidad).toBe(4);
  });

  it("sin cuenta segura la cantidad queda en blanco", () => {
    // dos trabajos en la misma OT (…791)
    expect(manoObra(ot([hoja("materiales_usados", "|4|hh", "|3|pp", "|5|hh", "|2|pp")]))).not.toHaveProperty("cantidad");
    // días, no horas (…527302)
    expect(manoObra(ot([hoja("materiales_usados", "Personas|4|", "Hh|2|Dias")]))).not.toHaveProperty("cantidad");
  });

  it("lee las horas escritas como texto con su cantidad (casos de octubre)", () => {
    expect(manoObra(ot([hoja("materiales_usados", "Horas de trabajo|3|2 personas")]))?.cantidad).toBe(6);
    expect(manoObra(ot([hoja("general", "horas revisión emergencia 3 personas|18|")]))?.cantidad).toBe(54);
    // "Reloj horario" es material, no horas
    expect(lineasDeOt(ot([hoja("materiales_usados", "Reloj horario|1|un")]), catalogo)[1]).toMatchObject({ texto: "1 un Reloj horario", cantidad: 1 });
  });

  it("días en cualquier parte de la hoja dejan la cantidad en blanco", () => {
    expect(manoObra(ot([hoja("materiales_usados", "Dias|3|Dias")], { minutosApp: 1600 }))).not.toHaveProperty("cantidad");
    expect(manoObra(ot([hoja("general", "Trabajo duro 2 días completos||")], { minutosApp: 900 }))).not.toHaveProperty("cantidad");
  });

  it("las hh del cronómetro salen marcadas para revisar", () => {
    const l = lineasDeOt(ot([hoja("materiales_usados", "|2|pp")], { minutosApp: 1560 }), catalogo);
    expect(l.at(-1)?.texto).toBe("26hh (según app)");
    expect(lineasDeOt(ot([hoja("materiales_usados", "|2|hh", "|2|pp")]), catalogo).at(-1)?.texto).toBe("2hh");
  });

  it("sin personas en la hoja son 2, o los asignados si son más", () => {
    expect(manoObra(ot([hoja("materiales_usados", "Hora|2|Hh")]))?.cantidad).toBe(4);                 // …728175
    expect(manoObra(ot([hoja("materiales_usados", "Hora|2|Hh")], { asignados: 1 }))?.cantidad).toBe(4);
    expect(manoObra(ot([hoja("materiales_usados", "Hora|2|Hh")], { asignados: 3 }))?.cantidad).toBe(6);
    expect(manoObra(ot([hoja("materiales_usados", "|1|hh", "|3|pp")], { asignados: 1 }))?.cantidad).toBe(3); // la hoja manda
    // ni hh en la hoja ni cronómetro: no hay cuenta
    expect(manoObra(ot([hoja("materiales_usados", "Tubo LED 18W|2|un")]))).not.toHaveProperty("cantidad");
    expect(lineasDeOt(ot([]), catalogo).map((l) => l.texto)).toEqual(["Revisión normal", "2 personas"]);
  });
});

describe("lineasDeOt: materiales", () => {
  it("texto del técnico en E; código sólo si calza exacto con el catálogo", () => {
    const l = lineasDeOt(ot([hoja("materiales_usados", "Tubo LED 18W|2|un", "Caja chuqui|1|Uni", "Apoyo en altura||")]), catalogo);
    expect(l.slice(1, -1)).toEqual([
      { texto: "2 un Tubo LED 18W", codigo: "tubled18", cantidad: 2 },
      { texto: "1 Uni Caja chuqui", cantidad: 1 },
      { texto: "Apoyo en altura", codigo: "AA" },
    ]);
  });

  it("personas y horas van al final como las escribe Claudio, con la nota que traían", () => {
    const l = lineasDeOt(ot([hoja("materiales_usados", "Alza-hombre|4|Hh", "|2|pp")]), catalogo);
    expect(l.map((x) => x.texto)).toEqual(["Revisión normal", "Alza-hombre", "2 personas", "4hh"]);
  });

  it("lo solicitado no se cobra; la hoja de cobro trae el código puesto", () => {
    const cobro: HojaCobro = {
      tipo: "cobro",
      columnas: [{ id: "a", label: "Código" }, { id: "b", label: "Cantidad" }, { id: "c", label: "Observación" }],
      filas: [{ a: "enctri10", b: "3", c: "" }],
    };
    const l = lineasDeOt(ot([hoja("materiales_solicitados", "Plafón|1|un"), cobro]), catalogo);
    expect(l.slice(1, -1)).toEqual([{ texto: "3 enctri10", codigo: "enctri10", cantidad: 3 }]);
  });
});

describe("pestanaCobros: el dibujo de bloques del Excel de Claudio", () => {
  const celda = (ws: Record<string, unknown>, ref: string) => (ws[ref] as { v?: unknown } | undefined)?.v;

  it("cabecera en la fila 13, líneas debajo, TOTALES en la 34 y la OT siguiente en la 36", () => {
    const ws = pestanaCobros(X, [
      ot([hoja("materiales_usados", "Tubo LED 18W|2|un", "|1|hh", "|2|pp")]),
      ot([], { numeroOt: "SF920260627859", fecha: "2026-06-20" }),
    ], catalogo, false);
    expect(celda(ws, "D13")).toBe("SF920260627830");
    expect(celda(ws, "C13")).toBe(46192); // 19-06-2026 como fecha de Excel
    expect(celda(ws, "G13")).toBe("Instalar 3 proyectores");
    expect([celda(ws, "E14"), celda(ws, "F14"), celda(ws, "I14")]).toEqual(["Revisión normal", "revnor", 2]);
    expect([celda(ws, "F15"), celda(ws, "I15")]).toEqual(["tubled18", 2]);
    expect(celda(ws, "I34")).toBe("TOTALES");
    expect(celda(ws, "D36")).toBe("SF920260627859");
  });

  it("las fórmulas de la plantilla: BUSCARV contra Materiales, IVA y totales", () => {
    const ws = pestanaCobros(X, [ot([hoja("materiales_usados", "Tubo LED 18W|2|un")])], catalogo, false);
    const f = (ref: string) => (ws[ref] as { f?: string }).f;
    expect(f("G15")).toBe('IFERROR(VLOOKUP($F15,Materiales!$G$2:$O$1912,2,FALSE),"-")');
    expect(f("J15")).toBe('IFERROR(VLOOKUP($F15,Materiales!$G$2:$O$1912,8,FALSE),"-")');
    expect(f("L15")).toBe('IFERROR(VLOOKUP($F15,Materiales!$G$2:$O$1912,9,FALSE),"-")');
    expect([f("K15"), f("M15"), f("N15"), f("O15"), f("P15")]).toEqual([
      'IFERROR(J15*I15,"-")', 'IFERROR(L15*I15,"-")', 'IFERROR(M15+K15,"-")', 'IFERROR(N15*0.19,"-")', 'IFERROR(O15+N15,"-")',
    ]);
    expect(f("K34")).toBe("SUM(K14:K33)");
    expect(f("L10")).toBe('SUMIF(J13:J35,"materiales",K13:K35)');
    expect(f("M10")).toBe('SUMIF(L13:L35,"m.o",M13:M35)');
    expect(f("C10")).toBe("COUNT(C13:C35)");
    expect(celda(ws, "E9")).toBe("TRABAJOS CON OT");
    expect(celda(ws, "F2")).toBe("ELECTRILAMSPA");
  });

  it("más de 20 líneas siguen en un bloque de continuación", () => {
    const muchas = Array.from({ length: 25 }, (_, i) => `Material ${i}|1|un`);
    const ws = pestanaCobros(X, [ot([hoja("materiales_usados", ...muchas)])], catalogo, false);
    expect(celda(ws, "E33")).toBe("1 un Material 18");
    expect(celda(ws, "D36")).toBe("Continuación");
    expect(celda(ws, "E37")).toBe("1 un Material 19");
  });

  it("técnico que hizo la hoja en Q y N° OT de Pangui en R, también al actualizar", () => {
    const conAutor = (autor: string, tipo = "materiales_usados"): HojaCobro => ({ ...hoja(tipo, "|1|hh"), autor });
    const a = ot([conAutor("Juan Pérez"), conAutor("Juan Pérez"), conAutor("Ana Soto"), conAutor("Pide Otro", "materiales_solicitados")], { id: "ot-a", numeroPangui: 343 });
    const ws = pestanaCobros(X, [a, ot([], { numeroPangui: null })], catalogo, false);
    expect([celda(ws, "Q12"), celda(ws, "Q13"), celda(ws, "R13")]).toEqual(["Técnico", "Juan Pérez, Ana Soto", 343]);
    expect((ws["R13"] as { z?: string }).z).toBe('"#"0'); // se ve "#343"
    expect([celda(ws, "Q36"), celda(ws, "R36")]).toEqual(["", ""]); // sin hoja ni número: en blanco
    // El dibujo sigue hacia abajo: franja en las líneas impares y dorado en TOTALES; R cierra la tabla.
    const s = (ref: string) => (ws[ref] as { s?: { fill?: { fgColor?: { rgb?: string } }; border?: { right?: { style?: string } } } }).s;
    expect(["Q13", "Q15", "R15", "Q34", "R34"].map((r) => s(r)?.fill?.fgColor?.rgb)).toEqual(["D0DFE6", "D9D9D9", "D9D9D9", "FFD757", "FFD757"]);
    expect(["Q20", "R20"].map((r) => s(r)?.border?.right?.style)).toEqual(["thin", "medium"]);
    expect(ws["!autofilter"]).toEqual({ ref: "C12:R58" });

    const rango = { desde: "2026-06-01", hasta: "2026-06-30" };
    const previo = leerExcelCobros(X, libroCobros(X, { ots: [a], catalogo: [], conOt: rango, sinOt: rango }))!;
    expect(previo.conOt[0]).toMatchObject({ id: "ot-a", cabecera: { tecnico: "Juan Pérez, Ana Soto", numeroPangui: 343 } });
  });

  it("actualiza también los Excel ya exportados: el del 3-nov (id en R) y el de técnico/N° en C/D", () => {
    const leer = (filas: (string | number | null)[][]) => {
      const wb = XLSX.utils.book_new();
      for (const n of ["CON OT", "SIN OT", "Materiales"]) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(n === "CON OT" ? filas : [["x"]]), n);
      return leerExcelCobros(X, new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" })))!.conOt;
    };
    // Un bloque con la tabla de la plantilla desde C; `antes` va entre B y la tabla.
    const libro = (antes: (string | number | null)[], despues: (string | number | null)[]) => {
      const filas: (string | number | null)[][] = Array.from({ length: 35 }, () => []);
      filas[11] = [null, null, ...antes.map(() => null), "Fecha termino", "Solicitud"];
      filas[12] = [1, null, ...antes, 46192, "SF920260627830", "Cabina 2", "Codigo", "Instalar", "", "Cantidad", "", "", "", "", "", "", "", ...despues];
      filas[13] = [null, null, ...antes.map(() => null), null, null, "Caja chuqui", "cajpla", null, null, 3];
      filas[33] = [null, null, ...antes.map(() => null), null, null, null, null, null, null, "TOTALES"];
      return filas;
    };
    const bloque = (id: string, tecnico: string, numeroPangui: number | null) => [{
      id, cabecera: { fecha: "2026-06-19", solicitud: "SF920260627830", lugar: "Cabina 2", descripcion: "Instalar", tecnico, numeroPangui },
      lineas: [{ texto: "Caja chuqui", codigo: "cajpla", cantidad: 3 }],
    }];
    expect(leer(libro([], [null, "ot-vieja"]))).toEqual(bloque("ot-vieja", "", null));
    expect(leer(libro(["Juan Pérez", 343], ["ot-cd"]))).toEqual(bloque("ot-cd", "Juan Pérez", 343)); // tabla hasta R: id en S
  });

  it("SIN OT lleva el solicitante en la Solicitud", () => {
    const ws = pestanaCobros(X, [ot([], { numeroOt: "", solicitante: "Cristian Quijada" })], catalogo, true);
    expect(celda(ws, "D13")).toBe("Cristian Quijada");
  });

  it("el libro reparte CON OT y SIN OT, cada una con su rango, y Materiales sin precios", () => {
    const bytes = libroCobros(X, {
      ots: [ot([]), ot([], { fecha: "2026-07-22" }), ot([], { numeroOt: "", fecha: "2026-07-22" })],
      catalogo: [{ codigo: "tubled18", descripcion: "Tubo led 18W", unidad: "Un", clasificacion: "Iluminación" }],
      conOt: { desde: "2026-06-17", hasta: "2026-07-21" },
      sinOt: { desde: "2026-07-01", hasta: "2026-07-31" },
    });
    const wb = XLSX.read(bytes, { type: "array" });
    expect(wb.SheetNames).toEqual(["CON OT", "SIN OT", "Materiales"]);
    expect(wb.Sheets["CON OT"]["D13"]?.v).toBe("SF920260627830");
    expect(wb.Sheets["CON OT"]["D36"]).toBeUndefined(); // la del 22-jul queda fuera del corte del ITO
    expect(wb.Sheets["SIN OT"]["C13"]?.v).toBe(46225);
    expect(wb.Sheets["Materiales"]["G4"]?.v).toBe("tubled18");
    expect(wb.Sheets["Materiales"]["J4"]).toBeUndefined();
  });

  it("con la tabla de precios de Patricio, Materiales la lleva tal cual y suma lo que falte del catálogo", () => {
    // Un "COBROS" mínimo con la pestaña Materiales como la de Patricio (fila 3 rótulos, datos desde la 4).
    // Empieza en la columna B, como la de verdad (su !ref no parte en A).
    const fila = (cod: string, desc: string, mat: number, mo: number) => ["Iluminación", null, null, null, null, cod, desc, "Un", mat, mo, 1, 1, mat, mo];
    const origen = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(origen, XLSX.utils.aoa_to_sheet([["ESTA TABLA NO SE MODIFICA"], [], ["Clasificación"], fila("tubled18", "Tubo led 18W", 6750, 4150), fila("revnor", "Revisión normal", 0, 12000)], { origin: "B1" } as unknown as XLSX.AOA2SheetOpts), "Materiales");
    const precios = leerPrecios(X, new Uint8Array(XLSX.write(origen, { bookType: "xlsx", type: "array" })));
    expect(precios.map((f) => [f[5], f[12], f[13]])).toEqual([["tubled18", 6750, 4150], ["revnor", 0, 12000]]);

    const wb = XLSX.read(libroCobros(X, {
      ots: [ot([])], precios,
      catalogo: [{ codigo: "tubled18", descripcion: "Tubo led 18W", unidad: "Un", clasificacion: "" }, { codigo: "cajpla", descripcion: "Caja plástica", unidad: "Un", clasificacion: "" }],
      conOt: { desde: "2026-06-01", hasta: "2026-06-30" }, sinOt: { desde: "2026-06-01", hasta: "2026-06-30" },
    }), { type: "array" });
    const m = wb.Sheets["Materiales"];
    expect([m["G4"]?.v, m["N4"]?.v, m["O4"]?.v]).toEqual(["tubled18", 6750, 4150]);
    expect([m["G5"]?.v, m["O5"]?.v]).toEqual(["revnor", 12000]);
    expect([m["G6"]?.v, m["N6"]]).toEqual(["cajpla", undefined]); // del catálogo, sin precio
    const sinMateriales = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(sinMateriales, XLSX.utils.aoa_to_sheet([["x"]]), "Otra");
    expect(leerPrecios(X, new Uint8Array(XLSX.write(sinMateriales, { bookType: "xlsx", type: "array" })))).toEqual([]);
  });

  it("actualizar: conserva lo que corrigió Claudio y agrega sólo las OTs nuevas", () => {
    const rango = { desde: "2026-07-01", hasta: "2026-07-31" };
    const a = ot([hoja("materiales_usados", "Caja chuqui|1|Uni", "|1|hh", "|2|pp")], { id: "ot-a", fecha: "2026-07-02" });
    const s = ot([hoja("materiales_usados", "|1|hh")], { id: "ot-s", numeroOt: "", solicitante: "Javier Araneda", fecha: "2026-07-03" });
    const primero = libroCobros(X, { ots: [a, s], catalogo: [], conOt: rango, sinOt: rango });

    // Claudio corrige en Excel: código y cantidad a la caja chuqui, y una nota suya.
    const wb = XLSX.read(primero, { type: "array" });
    wb.Sheets["CON OT"]["F15"] = { t: "s", v: "cajpla" };
    wb.Sheets["CON OT"]["I15"] = { t: "n", v: 3 };
    wb.Sheets["CON OT"]["E19"] = { t: "s", v: "Nota de Claudio" }; // con una fila vacía antes: no tiene que subir
    const editado = new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }));

    const previo = leerExcelCobros(X, editado)!;
    expect(previo.conOt.map((b) => b.id)).toEqual(["ot-a"]);
    expect(previo.sinOt.map((b) => b.id)).toEqual(["ot-s"]);
    const b = ot([], { id: "ot-b", numeroOt: "SF920260728999", fecha: "2026-07-20" });
    expect(otsNuevas([a, s, b], previo).map((o) => o.id)).toEqual(["ot-b"]);

    const final = XLSX.read(libroCobros(X, { ots: [a, s, b], catalogo: [], conOt: rango, sinOt: rango, previos: previo }), { type: "array" });
    const con = final.Sheets["CON OT"];
    expect([con["F15"]?.v, con["I15"]?.v]).toEqual(["cajpla", 3]); // lo de Claudio, intacto
    expect([con["E18"]?.v, con["E19"]?.v]).toEqual(["", "Nota de Claudio"]);
    expect(con["D36"]?.v).toBe("SF920260728999");                   // la nueva, en el bloque siguiente
    expect(con["S36"]?.v).toBe("ot-b");
    expect(final.Sheets["SIN OT"]["D36"]).toBeUndefined();           // la SIN OT no se repitió
  });

  it("los Excel sin id se reconocen por N° OT o por fecha + solicitante + descripción", () => {
    const previos = {
      conOt: [{ id: "", cabecera: { fecha: "2026-07-02", solicitud: "SF920260627830", lugar: "", descripcion: "" }, lineas: [] }],
      sinOt: [{ id: "", cabecera: { fecha: "2026-07-03", solicitud: "Javier Araneda", lugar: "", descripcion: "Instalar 3 proyectores" }, lineas: [] }],
    };
    const repetidas = [ot([]), ot([], { numeroOt: "", solicitante: "javier araneda", fecha: "2026-07-03" })];
    expect(otsNuevas(repetidas, previos)).toEqual([]);
  });

  it("no actualiza el COBROS original con macros y otras pestañas (se perderían)", () => {
    const orig = XLSX.utils.book_new();
    for (const n of ["CON OT", "SIN OT", "ASIG 2026", "Materiales"]) XLSX.utils.book_append_sheet(orig, XLSX.utils.aoa_to_sheet([["x"]]), n);
    expect(leerExcelCobros(X, new Uint8Array(XLSX.write(orig, { bookType: "xlsx", type: "array" })))).toBeNull();
  });

  it("lleva el logo y \"ELECTRILAM\" con \"SPA\" chico en las dos pestañas", () => {
    const bytes = libroCobros(X, {
      ots: [ot([])], catalogo: [], logo: new Uint8Array([137, 80, 78, 71]),
      conOt: { desde: "2026-06-01", hasta: "2026-06-30" }, sinOt: { desde: "2026-06-01", hasta: "2026-06-30" },
    });
    const zip = XLSX.CFB.read(bytes, { type: "array" });
    const leer = (ruta: string) => {
      const i = zip.FullPaths.findIndex((p: string) => p.endsWith("/" + ruta));
      return i < 0 ? "" : new TextDecoder().decode(Uint8Array.from(zip.FileIndex[i].content as ArrayLike<number>));
    };
    for (const n of [1, 2]) {
      expect(leer(`xl/worksheets/sheet${n}.xml`)).toContain('<drawing r:id="rIdLogo"/>');
      expect(leer(`xl/worksheets/sheet${n}.xml`)).toContain("<t>ELECTRILAM</t></r><r><rPr><b/><sz val=\"11\"/>");
      expect(leer(`xl/drawings/logo${n}.xml`)).toContain('r:embed="rId1"');
    }
    expect(leer("[Content_Types].xml")).toContain('Extension="png"');
    expect(leer("xl/worksheets/sheet1.xml")).toContain('showGridLines="0"');
  });
});
