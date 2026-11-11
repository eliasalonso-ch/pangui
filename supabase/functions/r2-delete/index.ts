// Borra un objeto de Cloudflare R2 a partir de su URL pública. El secreto de
// firma queda del lado del servidor.
//
// Request:
//   POST /functions/v1/r2-delete
//   Authorization: Bearer <JWT del usuario | service role key>
//   { url: "https://cdn.getpangui.com/ordenes/abc/foo.jpg" }
//
// Dos tipos de llamador:
//   - Un usuario: solo puede borrar lo que le pertenece (ver permiso.ts).
//   - El servidor con la service role key (borrado de workspace): sin
//     restricción de carpeta. Antes esta llamada devolvía 401 porque la llave
//     no es un usuario, y como el borrado es "mejor esfuerzo" nadie lo notaba:
//     los archivos quedaban huérfanos en el bucket.
//
// Un 404 de R2 cuenta como éxito (el objeto ya no está).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { borrarObjetoR2, claveValida, R2_PUBLIC_URL } from "../_shared/r2.ts";
import { puedeBorrarClave } from "./permiso.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const url = body.url;
  if (!url || typeof url !== "string" || !url.startsWith(`${R2_PUBLIC_URL}/`)) {
    return jsonResponse({ error: "invalid_url" }, 400);
  }
  // La URL viene codificada (%20…); la clave real del objeto no.
  let key: string;
  try {
    key = decodeURIComponent(url.slice(R2_PUBLIC_URL.length + 1));
  } catch {
    return jsonResponse({ error: "invalid_key" }, 400);
  }
  if (!claveValida(key)) {
    return jsonResponse({ error: "invalid_key" }, 400);
  }

  const esServidor = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (!esServidor) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "unauthenticated" }, 401);
    }
    if (!(await puedeBorrarClave(supabase, key))) {
      return jsonResponse({ error: "forbidden" }, 403);
    }
  }

  try {
    await borrarObjetoR2(key);
  } catch (err) {
    return jsonResponse({ error: "r2_delete_failed", detail: String(err) }, 502);
  }
  return jsonResponse({ ok: true });
});
