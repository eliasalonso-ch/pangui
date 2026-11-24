import { describe, expect, it } from "vitest";
import {
  etiquetaPendiente, grupoPendiente, RAPIDAS, rapidaActiva, resumenPendiente, validarPendiente, filtroCuando,
  etiquetaAviso, descomponerAviso, AVISO_MAX, destinoPorDefecto,
  type DatosPendiente,
} from "@/lib/pendientes-api";

describe("filtroCuando", () => {
  it("arma el or() de PostgREST con los mismos cortes que grupoPendiente", () => {
    expect(filtroCuando([], "2026-11-23")).toBeNull();
    expect(filtroCuando(["atrasados", "hoy"], "2026-11-23")).toBe("fecha.lt.2026-11-23,fecha.eq.2026-11-23");
    expect(filtroCuando(["semana", "despues"], "2026-11-23"))
      .toBe("and(fecha.gt.2026-11-23,fecha.lte.2026-11-30),fecha.gt.2026-11-30");
  });
  it("no se corre de día con el cambio de horario", () => {
    expect(filtroCuando(["despues"], "2027-04-01")).toBe("fecha.gt.2027-04-08");
  });
});

// Lunes 23 nov 2026, 16:40 hora local.
const ahora = new Date(2026, 10, 23, 16, 40);
const hoy = "2026-11-23";
const calc = (id: string, a = ahora) => RAPIDAS.find(r => r.id === id)!.calc(a);
const base: DatosPendiente = { nota: "Confirmar materiales", fecha: "2026-11-24", hora: "09:00", recurrencia: "ninguna", recurrencia_config: null, push: true, correo: true, estado: "por_hacer", prioridad: "media", aviso_minutos: 0, gcal_destino: "calendar" };

describe("etiquetaPendiente", () => {
  it("marca atrasados con los días", () => {
    expect(etiquetaPendiente("2026-11-22", hoy)).toEqual({ texto: "Atrasado 1 día", atrasado: true });
    expect(etiquetaPendiente("2026-11-13", hoy)).toEqual({ texto: "Atrasado 10 días", atrasado: true });
  });

  it("hoy y mañana llevan la hora si hay", () => {
    expect(etiquetaPendiente(hoy, hoy).texto).toBe("Hoy");
    expect(etiquetaPendiente(hoy, hoy, "17:45").texto).toBe("Hoy · 17:45");
    expect(etiquetaPendiente("2026-11-24", hoy, "09:00").texto).toBe("Mañana · 09:00");
    expect(etiquetaPendiente("2026-12-23", hoy).texto).toBe("En 30 días");
  });

  it("lejanos muestran la fecha, sin correrse por el cambio de horario", () => {
    expect(etiquetaPendiente("2027-05-01", hoy).texto).toMatch(/^1 .*2027/);
    expect(etiquetaPendiente("2027-04-10", "2027-04-01").texto).toBe("En 9 días");
  });
});

describe("grupoPendiente", () => {
  it("separa atrasados, hoy, la semana y más adelante", () => {
    expect(grupoPendiente("2026-11-20", hoy)).toBe("atrasados");
    expect(grupoPendiente(hoy, hoy)).toBe("hoy");
    expect(grupoPendiente("2026-11-30", hoy)).toBe("semana");
    expect(grupoPendiente("2026-12-01", hoy)).toBe("despues");
  });
});

describe("RAPIDAS", () => {
  it("en 1 hora redondea al próximo cuarto", () => {
    expect(calc("1h")).toEqual({ fecha: hoy, hora: "17:45" });
  });
  it("esta tarde pasa a mañana si ya son las 18", () => {
    expect(calc("tarde")).toEqual({ fecha: hoy, hora: "18:00" });
    expect(calc("tarde", new Date(2026, 10, 23, 19, 0))).toEqual({ fecha: "2026-11-24", hora: "18:00" });
  });
  it("lunes y meses fijan solo el día", () => {
    expect(calc("lunes")).toEqual({ fecha: "2026-11-30", hora: null });
    expect(calc("6m")).toEqual({ fecha: "2027-05-23", hora: null });
  });
  it("reconoce el atajo activo", () => {
    expect(rapidaActiva("2026-11-24", "09:00", ahora)).toBe("manana");
    expect(rapidaActiva("2026-12-02", null, ahora)).toBeNull();
  });
});

describe("resumenPendiente", () => {
  it("lee la elección completa", () => {
    expect(resumenPendiente(base, "Cada semana", ahora))
      .toBe("Te aviso mañana a las 09:00, y después cada semana, por push y correo.");
  });
  it("sin hora usa las 08:30", () => {
    expect(resumenPendiente({ ...base, fecha: "2026-11-24", hora: null, push: false }, null, ahora))
      .toBe("Te aviso mañana a las 08:30, por correo.");
  });
});

describe("validarPendiente", () => {
  it("pide nota, día y al menos un canal", () => {
    expect(validarPendiente({ ...base, nota: "  " }, ahora)?.campo).toBe("nota");
    expect(validarPendiente({ ...base, fecha: "" }, ahora)?.campo).toBe("fecha");
    expect(validarPendiente({ ...base, push: false, correo: false }, ahora)?.campo).toBe("canal");
    expect(validarPendiente(base, ahora)).toBeNull();
  });
  it("rechaza el pasado salvo al editar sin mover la fecha", () => {
    expect(validarPendiente({ ...base, fecha: hoy, hora: "16:00" }, ahora)?.mensaje).toBe("Esa hora ya pasó.");
    expect(validarPendiente({ ...base, fecha: "2026-11-20" }, ahora)?.mensaje).toBe("Ese día ya pasó.");
    expect(validarPendiente({ ...base, fecha: "2026-11-20" }, ahora, false)).toBeNull();
  });
});

describe("aviso", () => {
  it("etiqueta con la unidad más grande exacta", () => {
    expect(etiquetaAviso(0)).toBe("A la hora");
    expect(etiquetaAviso(15)).toBe("15 minutos antes");
    expect(etiquetaAviso(60)).toBe("1 hora antes");
    expect(etiquetaAviso(2880)).toBe("2 días antes");
    expect(etiquetaAviso(20_160)).toBe("2 semanas antes");
    expect(etiquetaAviso(86_400)).toBe("2 meses antes");
    expect(etiquetaAviso(90)).toBe("90 minutos antes");
  });
  it("descompone para el editor personalizado", () => {
    expect(descomponerAviso(4320)).toEqual({ cantidad: 3, unidad: "dias" });
    expect(descomponerAviso(0)).toEqual({ cantidad: 0, unidad: "minutos" });
  });
  it("el resumen dice cuándo avisa, o que avisa al tiro si ya pasó", () => {
    expect(resumenPendiente({ ...base, fecha: "2026-11-30", hora: "15:00", aviso_minutos: 1440 }, null, ahora))
      .toBe("Te aviso 1 día antes, el dom 29 nov a las 15:00, por push y correo.");
    expect(resumenPendiente({ ...base, fecha: "2026-11-24", hora: "09:00", aviso_minutos: 10_080 }, null, ahora))
      .toBe("Te aviso apenas lo guardes (ese momento ya pasó), por push y correo.");
  });
  it("valida el rango", () => {
    expect(validarPendiente({ ...base, aviso_minutos: AVISO_MAX + 1 }, ahora)?.campo).toBe("aviso");
    expect(validarPendiente({ ...base, aviso_minutos: -5 }, ahora)?.campo).toBe("aviso");
  });
});

describe("destinoPorDefecto", () => {
  it("con hora es una cita (Calendar); sin hora, un to-do del día (Tasks)", () => {
    expect(destinoPorDefecto("15:00")).toBe("calendar");
    expect(destinoPorDefecto(null)).toBe("tasks");
  });
});
