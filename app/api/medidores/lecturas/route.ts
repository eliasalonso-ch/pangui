/**
 * POST /api/medidores/lecturas — ingesta de lecturas desde un dispositivo.
 *
 * Es el único camino de escritura que no tiene sesión de usuario: un gateway,
 * un ESP32 o un PLC no pueden hacer login. Se autentica con el token del
 * medidor, que el cliente copia desde la ficha al configurar el equipo.
 *
 *   curl -X POST https://.../api/medidores/lecturas \
 *     -H 'Authorization: Bearer pang_mtr_...' \
 *     -H 'Content-Type: application/json' \
 *     -d '{"valor": 7.8}'
 *
 * `ts` es opcional: sin él la lectura se fecha ahora. Un gateway que estuvo sin
 * red manda su buffer con el `ts` de cada medición, y así caen donde
 * corresponde en el gráfico en vez de amontonarse al reconectar.
 *
 * Lo que este endpoint NO hace: decidir si la lectura abre una OT. Eso es del
 * trigger `fn_medidor_lectura_critica`, para que una lectura cargada a mano
 * dispare exactamente igual que una automatizada.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Service role: el dispositivo no tiene sesión, así que RLS no puede resolver
// `my_workspace_id()`. El aislamiento entre workspaces lo da el token — se
// escribe en el medidor que el token identifica y en ningún otro.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/** Techo de lecturas por request, para que un buffer roto no inserte 100k filas. */
const MAX_LOTE = 500;

/**
 * CORS abierto a cualquier origen.
 *
 * No es una brecha: este endpoint no usa cookies ni sesión, así que un navegador
 * no puede publicar "en nombre de" nadie por estar logueado. La única llave es
 * el token del medidor, que hay que tener explícitamente — y `*` obliga a que
 * `credentials` NO viaje, que es justo lo que se quiere acá.
 *
 * Se abre porque el que publica es un equipo en la red del cliente, no una
 * página nuestra: un gateway, un ESP32, o una herramienta de diagnóstico que
 * corre en el navegador del instalador. Restringir por origen no protegería
 * nada (un dispositivo no manda Origin) y rompería justamente esos usos.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

/** Preflight: el navegador lo manda antes de un POST con Authorization. */
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

type Entrada = { valor: unknown; ts?: unknown };

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Falta el token del medidor." }, { status: 401, headers: CORS });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400, headers: CORS });
  }

  // Se acepta una lectura suelta o un lote: el gateway con buffer manda varias
  // de una, y obligarlo a un request por medición sería gratis para nosotros y
  // caro para él.
  const entradas: Entrada[] = Array.isArray(body)
    ? body as Entrada[]
    : [body as Entrada];

  if (entradas.length === 0) {
    return NextResponse.json({ ok: false, error: "Sin lecturas." }, { status: 400, headers: CORS });
  }
  if (entradas.length > MAX_LOTE) {
    return NextResponse.json(
      { ok: false, error: `Máximo ${MAX_LOTE} lecturas por envío.` },
      { status: 413, headers: CORS },
    );
  }

  const { data: medidor, error: errMedidor } = await admin
    .from("medidores")
    .select("id, workspace_id, activo, tipo")
    .eq("token", token)
    .maybeSingle();

  // Mismo mensaje para token inexistente y medidor dado de baja: distinguirlos
  // le diría a quien prueba tokens cuáles existen.
  if (errMedidor || !medidor || !medidor.activo) {
    return NextResponse.json({ ok: false, error: "Token inválido." }, { status: 401, headers: CORS });
  }

  const filas: { medidor_id: string; workspace_id: string; valor: number; ts: string }[] = [];
  for (const entrada of entradas) {
    // Number() y no parseFloat(): parseFloat("7.8 mm/s") devuelve 7.8 en vez de
    // rechazarlo, y una unidad pegada al número es justo el error que comete un
    // firmware mal escrito.
    const valor = typeof entrada?.valor === "number" ? entrada.valor : Number(entrada?.valor);
    if (!Number.isFinite(valor)) {
      return NextResponse.json(
        { ok: false, error: "Cada lectura necesita un `valor` numérico." },
        { status: 400, headers: CORS },
      );
    }

    let ts = new Date();
    if (entrada?.ts != null) {
      const parsed = new Date(entrada.ts as string);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { ok: false, error: "`ts` no es una fecha válida (usa ISO 8601)." },
          { status: 400, headers: CORS },
        );
      }
      // Un reloj adelantado en el dispositivo metería lecturas en el futuro que
      // se quedan fijas a la derecha del gráfico para siempre. Se toleran 5
      // minutos de deriva, que es lo normal en un equipo sin NTP.
      if (parsed.getTime() > Date.now() + 5 * 60_000) {
        return NextResponse.json(
          { ok: false, error: "`ts` está en el futuro; revisa el reloj del dispositivo." },
          { status: 400, headers: CORS },
        );
      }
      ts = parsed;
    }

    filas.push({
      medidor_id: medidor.id,
      workspace_id: medidor.workspace_id,
      valor,
      ts: ts.toISOString(),
    });
  }

  // `creado_por` queda NULL a propósito: es lo que distingue una lectura de
  // dispositivo de una cargada por una persona.
  const { error: errInsert } = await admin.from("medidor_lecturas").insert(filas);
  if (errInsert) {
    return NextResponse.json({ ok: false, error: "No se pudo guardar la lectura." }, { status: 500, headers: CORS });
  }

  return NextResponse.json({ ok: true, recibidas: filas.length }, { headers: CORS });
}
