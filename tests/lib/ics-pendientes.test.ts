import { describe, expect, it } from "vitest";
import { construirIcs, escapar, eventoGoogle, plegar, utcDeSantiago, type PendienteIcs } from "@/supabase/functions/_shared/ics-pendientes";

const base: PendienteIcs = {
  id: "abc", nota: "Confirmar materiales, con Electrocom", fecha: "2026-11-24", hora: "18:00:00",
  estado: "por_hacer", prioridad: "alta", orden_id: "o-1", ot_numero: 1518, ot_titulo: "Tablero; block 4",
  usuario_nombre: "Ana Pérez",
};
const ahora = new Date(Date.UTC(2026, 10, 23, 20, 0, 0));

describe("utcDeSantiago", () => {
  it("respeta el horario de verano (UTC-3) y el de invierno (UTC-4)", () => {
    expect(utcDeSantiago("2026-11-24", "18:00").toISOString()).toBe("2026-11-24T21:00:00.000Z");
    expect(utcDeSantiago("2027-06-15", "08:30").toISOString()).toBe("2027-06-15T12:30:00.000Z");
  });
});

describe("escapar y plegar", () => {
  it("escapa lo que RFC 5545 pide", () => {
    expect(escapar("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
  it("corta a 75 octetos contando UTF-8", () => {
    const linea = "SUMMARY:" + "ñ".repeat(60);
    const partes = plegar(linea).split("\r\n");
    expect(partes.length).toBeGreaterThan(1);
    for (const p of partes) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(partes.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(linea);
  });
});

describe("construirIcs", () => {
  it("evento con hora: 30 min en UTC, texto escapado y link a la OT", () => {
    const ics = construirIcs([base], ahora);
    const plano = ics.replace(/\r\n /g, "");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(plano).toContain("UID:abc@getpangui.com");
    expect(plano).toContain("DTSTART:20261124T210000Z");
    expect(plano).toContain("DTEND:20261124T213000Z");
    expect(plano).toContain("SUMMARY:Confirmar materiales\\, con Electrocom — Ana");
    expect(plano).toContain("De: Ana Pérez");
    expect(plano).toContain("OT #1518 · Tablero\\; block 4");
    expect(plano).toContain("Prioridad: Alta");
    expect(plano).toContain("URL:https://app.getpangui.com/ordenes?id=o-1");
  });
  it("sin hora es de todo el día, también a fin de mes", () => {
    const plano = construirIcs([{ ...base, fecha: "2026-11-30", hora: null }], ahora);
    expect(plano).toContain("DTSTART;VALUE=DATE:20261130");
    expect(plano).toContain("DTEND;VALUE=DATE:20261201");
  });
  it("sin pendientes sigue siendo un calendario válido", () => {
    expect(construirIcs([], ahora)).not.toContain("VEVENT");
  });
});

describe("eventoGoogle", () => {
  it("con hora: dateTime en UTC, 30 min, mismo título y link que el .ics", () => {
    const e = eventoGoogle(base);
    expect(e.start).toEqual({ dateTime: "2026-11-24T21:00:00.000Z" });
    expect(e.end).toEqual({ dateTime: "2026-11-24T21:30:00.000Z" });
    expect(e.summary).toBe("Confirmar materiales, con Electrocom — Ana");
    expect(e.description).toContain("OT #1518 · Tablero; block 4");
    expect(e.source.url).toBe("https://app.getpangui.com/ordenes?id=o-1");
    expect(e.extendedProperties.private.pangui_pendiente_id).toBe("abc");
  });
  it("sin hora: a las 08:30 de Santiago (la hora del push), no de día completo", () => {
    const e = eventoGoogle({ ...base, fecha: "2026-12-31", hora: null });
    expect(e.start).toEqual({ dateTime: "2026-12-31T11:30:00.000Z" });
    expect(e.end).toEqual({ dateTime: "2026-12-31T12:00:00.000Z" });
  });
  it("aviso del pendiente, con el tope de 4 semanas de Google", () => {
    const min = (n?: number) => eventoGoogle(base, n).reminders.overrides[0].minutes;
    expect(min()).toBe(0);
    expect(min(1440)).toBe(1440);
    expect(min(40_320)).toBe(40_320);
    expect(min(86_400)).toBe(40_320); // 2 meses: Google avisa 4 semanas antes; el resto lo cubre Pangui
    expect(eventoGoogle(base, 60).reminders.useDefault).toBe(false);
  });
});
