import { describe, it, expect } from "vitest";
import {
  resendCooldownSeconds,
  normalizeEmail,
  isPlausibleEmail,
  normalizeOtpCode,
  isCompleteOtpCode,
  RESEND_INTERVAL_MS,
  OTP_LENGTH,
} from "@/lib/magic-link";

describe("resendCooldownSeconds", () => {
  it("sin envio previo se puede pedir de inmediato", () => {
    expect(resendCooldownSeconds(1_000_000, null)).toBe(0);
  });

  // Con contrasenia esto era invisible; con magic link, un tecnico que no ve el
  // correo y toca "reenviar" queda un minuto sin poder entrar. La UI tiene que
  // mostrar la espera en vez de dejarlo chocar contra un error del servidor.
  it("devuelve los segundos que faltan dentro de la ventana", () => {
    const last = 1_000_000;
    expect(resendCooldownSeconds(last + 1_000, last)).toBe(59);
    expect(resendCooldownSeconds(last + 30_000, last)).toBe(30);
    expect(resendCooldownSeconds(last + 59_500, last)).toBe(1);
  });

  it("llega a 0 justo al cumplirse el intervalo", () => {
    const last = 1_000_000;
    expect(resendCooldownSeconds(last + RESEND_INTERVAL_MS, last)).toBe(0);
    expect(resendCooldownSeconds(last + RESEND_INTERVAL_MS + 5_000, last)).toBe(0);
  });

  it("respeta un intervalo explicito", () => {
    expect(resendCooldownSeconds(5_000, 0, 10_000)).toBe(5);
  });
});

describe("normalizeEmail", () => {
  it("recorta y pasa a minusculas", () => {
    expect(normalizeEmail("  Tecnico@Empresa.CL ")).toBe("tecnico@empresa.cl");
  });
});

describe("isPlausibleEmail", () => {
  it.each([
    "a@b.cl",
    "tecnico@empresa.cl",
    "  Tecnico@Empresa.CL  ",
    "nombre.apellido+ot@sub.dominio.com",
  ])("acepta %s", (v) => {
    expect(isPlausibleEmail(v)).toBe(true);
  });

  it.each([
    ["vacio", ""],
    ["sin arroba", "tecnico.empresa.cl"],
    ["dos arrobas", "a@b@c.cl"],
    ["sin dominio", "tecnico@"],
    ["dominio sin punto", "tecnico@empresa"],
    ["con espacio", "tecnico @empresa.cl"],
    ["punto al final", "tecnico@empresa."],
  ])("rechaza %s", (_name, v) => {
    expect(isPlausibleEmail(v)).toBe(false);
  });
});

// OTP_LENGTH tiene que coincidir con "Email OTP Length" en Supabase
// (Authentication → Providers → Email). Si difieren, las cajas truncan un
// codigo valido y TODO login falla con "codigo incorrecto". Ya paso: el
// proyecto emitia 8 digitos mientras la UI pedia 6.
describe("normalizeOtpCode", () => {
  it("el largo declarado coincide con el configurado en Supabase", () => {
    expect(OTP_LENGTH).toBe(6);
  });

  it("deja solo digitos", () => {
    expect(normalizeOtpCode("39 20-78")).toBe("392078");
  });

  it("corta al largo configurado", () => {
    expect(normalizeOtpCode("1234567890123")).toBe("123456");
  });

  it("isCompleteOtpCode exige exactamente OTP_LENGTH", () => {
    expect(isCompleteOtpCode("39207")).toBe(false);
    expect(isCompleteOtpCode("392078")).toBe(true);
    expect(isCompleteOtpCode("39 20 78")).toBe(true);
    expect(isCompleteOtpCode("")).toBe(false);
  });
});
