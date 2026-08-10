"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";

const ORIGENES = [
  ["busqueda", "Búsqueda en Google"],
  ["recomendacion", "Recomendación / boca a boca"],
  ["redes", "Redes sociales"],
  ["evento", "Evento o feria"],
  ["otro", "Otro"],
];

const EQUIPOS = ["1 – 5", "6 – 15", "16 – 40", "41 – 100", "Más de 100"];

const inputClass =
  "h-11 w-full rounded-[6px] border border-[var(--hairline-strong)] bg-white px-3 text-[15px] text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent)]";

function Label({ htmlFor, children, required }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-[13px] font-semibold text-[var(--ink)]">
      {children}
      {required && <span className="text-[var(--accent)]">*</span>}
    </label>
  );
}

export default function DemoForm() {
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (status === "sending") return;

    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    setStatus("sending");
    setError("");

    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo enviar la solicitud");
      setStatus("sent");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-[14px] border border-[var(--hairline)] bg-white p-7 shadow-xl shadow-black/5 md:p-9">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#34C759] text-white">
          <Check size={26} strokeWidth={2.6} />
        </span>
        <h2 className="mt-6 font-display text-[26px] font-bold leading-[1.15] tracking-[-0.025em]">
          Solicitud recibida.
        </h2>
        <p className="mt-4 text-[15px] leading-[1.65] text-[var(--ink-2)]">
          Le escribiremos dentro de un día hábil para coordinar la demo. Si
          prefiere adelantarse, puede crear su cuenta ahora y empezar la prueba
          de 30 días sin esperar.
        </p>
        <Link
          href="/registro"
          className="mt-7 inline-flex h-12 items-center justify-center gap-3 bg-[var(--accent)] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
        >
          Empezar prueba gratis
          <ArrowRight size={17} />
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[14px] border border-[var(--hairline)] bg-white p-6 shadow-xl shadow-black/5 md:p-8"
    >
      <h2 className="font-display text-[22px] font-bold leading-[1.2] tracking-[-0.02em] md:text-[26px]">
        Complete el formulario y le respondemos a la brevedad.
      </h2>

      <div className="mt-7 grid gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="nombre" required>
              Nombre
            </Label>
            <input id="nombre" name="nombre" required maxLength={120} className={inputClass} />
          </div>
          <div>
            <Label htmlFor="empresa">Empresa</Label>
            <input id="empresa" name="empresa" maxLength={160} className={inputClass} />
          </div>
        </div>

        <div>
          <Label htmlFor="email" required>
            Email de trabajo
          </Label>
          <input id="email" name="email" type="email" required maxLength={200} className={inputClass} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="telefono">Teléfono</Label>
            <input
              id="telefono"
              name="telefono"
              type="tel"
              maxLength={40}
              placeholder="+56 9 1234 5678"
              className={`${inputClass} placeholder:text-[var(--ink-4)]`}
            />
          </div>
          <div>
            <Label htmlFor="equipo">Tamaño del equipo</Label>
            <select id="equipo" name="equipo" defaultValue="" className={inputClass}>
              <option value="">Seleccione…</option>
              {EQUIPOS.map((e) => (
                <option key={e} value={e}>
                  {e} personas
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label htmlFor="origen">¿Cómo nos conoció?</Label>
          <select id="origen" name="origen" defaultValue="" className={inputClass}>
            <option value="">Seleccione…</option>
            {ORIGENES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="mensaje">¿Qué le gustaría ver en la demo?</Label>
          <textarea
            id="mensaje"
            name="mensaje"
            rows={3}
            maxLength={2000}
            placeholder="Cuéntenos brevemente cómo trabaja hoy."
            className="w-full resize-y rounded-[6px] border border-[var(--hairline-strong)] bg-white px-3 py-2.5 text-[15px] leading-[1.55] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-4)] focus:border-[var(--accent)]"
          />
        </div>
      </div>

      {/* Honeypot — hidden from users, catches naive bots. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <p className="mt-6 text-[13px] text-[var(--ink-3)]">
        Los campos marcados con <span className="text-[var(--accent)]">*</span> son obligatorios.
      </p>

      {status === "error" && (
        <p role="alert" className="mt-4 rounded-[6px] bg-[#FEF2F2] px-3 py-2.5 text-[14px] text-[#B91C1C]">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex h-12 items-center justify-center gap-3 bg-[var(--accent)] px-7 text-[15px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-70"
        >
          {status === "sending" ? (
            <>
              <Loader2 size={17} className="animate-spin" />
              Enviando…
            </>
          ) : (
            <>
              Solicitar demo
              <ArrowRight size={17} />
            </>
          )}
        </button>
        <p className="text-[12.5px] leading-[1.5] text-[var(--ink-3)]">
          Al enviar acepta nuestra{" "}
          <Link href="/privacidad" className="underline">
            política de privacidad
          </Link>
          .
        </p>
      </div>
    </form>
  );
}
