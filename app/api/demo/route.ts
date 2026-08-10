import { NextRequest, NextResponse } from "next/server";

// Public (unauthenticated) demo-request form. Mirrors app/api/soporte/route.ts
// but, because anyone can reach it, it validates hard, rate-limits per IP and
// carries a honeypot field.

const ORIGENES: Record<string, string> = {
  busqueda: "Búsqueda en Google",
  recomendacion: "Recomendación / boca a boca",
  redes: "Redes sociales",
  evento: "Evento o feria",
  otro: "Otro",
};

const MAX_PER_WINDOW = 3;
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }
  return recent.length > MAX_PER_WINDOW;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character
  );
}

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "desconocida";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intente nuevamente en unos minutos." },
      { status: 429 }
    );
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Servicio de correo no configurado" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, string> | null;
  if (!body) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });

  // Honeypot: real users never fill this hidden field.
  if (body.website) return NextResponse.json({ ok: true });

  const nombre = (body.nombre ?? "").trim();
  const empresa = (body.empresa ?? "").trim();
  const email = (body.email ?? "").trim();
  const telefono = (body.telefono ?? "").trim();
  const equipo = (body.equipo ?? "").trim();
  const origen = (body.origen ?? "").trim();
  const mensaje = (body.mensaje ?? "").trim();

  if (nombre.length < 2 || nombre.length > 120) {
    return NextResponse.json({ error: "Ingrese su nombre" }, { status: 400 });
  }
  if (!isEmail(email) || email.length > 200) {
    return NextResponse.json({ error: "Ingrese un email válido" }, { status: 400 });
  }
  if (empresa.length > 160 || telefono.length > 40 || equipo.length > 40 || mensaje.length > 2000) {
    return NextResponse.json({ error: "Alguno de los campos es demasiado largo" }, { status: 400 });
  }

  const filas = [
    ["Nombre", nombre],
    ["Empresa", empresa || "No indicada"],
    ["Email", email],
    ["Teléfono", telefono || "No indicado"],
    ["Tamaño del equipo", equipo || "No indicado"],
    ["Cómo nos conoció", ORIGENES[origen] ?? "No indicado"],
  ]
    .map(([label, value]) => `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}`)
    .join("<br>");

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? "Pangui <noreply@getpangui.com>",
      to: ["contacto@getpangui.com"],
      reply_to: email,
      subject: `[Demo Pangui] ${nombre}${empresa ? ` — ${empresa}` : ""}`,
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.55;color:#1f2937"><h2>Nueva solicitud de demo</h2><p>${filas}</p>${
        mensaje
          ? `<hr style="border:0;border-top:1px solid #e5e7eb"><p style="white-space:pre-wrap">${escapeHtml(mensaje)}</p>`
          : ""
      }</div>`,
    }),
  });

  if (!resendResponse.ok) {
    console.error("[demo] Resend failed", resendResponse.status, await resendResponse.text());
    return NextResponse.json({ error: "No se pudo enviar la solicitud" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
