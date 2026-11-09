import { describe, expect, it } from "vitest";
import { armarFichaPts, fechaPts, horaPts } from "@/lib/pts-udec";

const pasos = [
  { id: "t", titulo: "Trabajadores" },
  { id: "h", titulo: "Herramientas" },
  { id: "tt", titulo: "Tipo de trabajo" },
  { id: "c", titulo: "¿Realiza trabajos en caliente?" },
  { id: "p", titulo: "Precauciones trabajo en caliente" },
  { id: "fi", titulo: "Fecha de Inicio de Trabajo" },
  { id: "hi", titulo: "Horario propuesto de Inicio Trabajos" },
  { id: "hf", titulo: "Horario estimado Finalización de Trabajos" },
];

const ot = {
  titulo: "Cambio de luminaria", hito: "Enzo Cifuente", solicitante: "Andrea Mora",
  tipo_trabajo: "reactiva", prioridad: "media",
  ubicaciones: { edificio: "Facultad de Ingeniería", detalle: "4to nivel" },
};

const valor = (filas: ReturnType<typeof armarFichaPts>, pregunta: string) =>
  filas.find(f => f.pregunta.startsWith(pregunta))?.valor;

describe("ficha PTS UdeC", () => {
  it("lee fecha y hora como las guardan la web y el móvil", () => {
    expect(fechaPts("2026-11-09T00:00:00.000Z")).toBe("09-11-2026");          // web
    expect(fechaPts("2026-11-09T15:00:00+00:00")).toBe("09-11-2026");         // móvil (mediodía Chile)
    expect(horaPts("1970-01-01T17:30:00.000Z")).toBe("17.30 horas");          // web
    expect(horaPts("2026-11-09T20:30:00+00:00")).toBe("17.30 horas");         // móvil (Chile UTC-3)
  });

  it("sin N° SF es Otro Medio + Emergencia; con SF es Me-Conecta + Planificado", () => {
    const sin = armarFichaPts(ot, pasos, []);
    expect(valor(sin, "Tipo de Orden")).toBe("Otro Medio");
    expect(valor(sin, "Prioridad")).toBe("Emergencia");
    expect(valor(sin, "Medio de Solicitud")).toBe("Llamado de Andrea Mora");

    const con = armarFichaPts({ ...ot, descripcion: "N° OT: SF920261130825" }, pasos, []);
    expect(valor(con, "Tipo de Orden")).toBe("Solicitud de Trabajo por Me-Conecta");
    expect(valor(con, "Nº Orden")).toBe("SF920261130825");
    expect(valor(con, "Prioridad")).toBe("Planificado");
  });

  it("arma las respuestas del técnico", () => {
    const filas = armarFichaPts(ot, pasos, [
      { paso_id: "t", valor_json: { checked: ["Osvaldo Ramírez", "Alguien Nuevo"] } },
      { paso_id: "h", valor_json: { checked: ["Escalera"] } },
      { paso_id: "tt", valor_json: { checked: ["Trabajos Eléctricos", "Trabajo en Altura"] } },
      { paso_id: "c", valor_texto: "Sí" },
      { paso_id: "p", valor_json: { checked: ["Red húmeda lista"] } },
      { paso_id: "fi", valor_fecha: "2026-11-09T00:00:00.000Z" },
      { paso_id: "hi", valor_fecha: "1970-01-01T09:00:00.000Z" },
    ]);
    expect(valor(filas, "Supervisor eléctrico")).toBe("Enzo Cifuentes");
    expect(valor(filas, "Lugar")).toBe("Facultad de Ingeniería · 4to nivel");
    expect(valor(filas, "Fecha estimada")).toBe("09-11-2026"); // sin fecha de término = mismo día
    expect(valor(filas, "Horario propuesto")).toBe("09.00 horas");
    expect(valor(filas, "Tipo de trabajo")).toBe("Trabajos Eléctricos\nTrabajo en Altura");
    expect(valor(filas, "¿Realiza")).toBe("Si");
    expect(valor(filas, "Precauciones")).toBe("Red húmeda lista");
    // Conocido → "Nombre / Cargo / RUT"; desconocido → solo el nombre.
    expect(valor(filas, "Nombre/Cargo/Rut")).toMatch(/^Osvaldo Ramírez \/ .+ \/ \d{7,8}-[\dkK]\nAlguien Nuevo$/);
    // Los datos fijos de Electrilam ya están completos.
    for (const p of ["Organismo", "Nombre Supervisor", "Nombre Experto"]) {
      expect(filas.find(f => f.pregunta.startsWith(p))?.falta).toBeUndefined();
    }
    expect(valor(filas, "OBSERVACIONES")).toBe("Herramientas: Escalera.");
    expect(filas.find(f => f.pregunta.startsWith("Horario estimado"))?.falta).toBe(true);
  });
});
