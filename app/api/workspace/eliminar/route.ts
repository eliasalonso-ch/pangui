/**
 * POST /api/workspace/eliminar
 * Body: { password: string, confirmacion: string }
 *
 * Borra el workspace completo del owner: las OTs, los activos, los
 * procedimientos, las fotos y las cuentas de TODOS los miembros. Es la salida
 * definitiva; la alternativa no destructiva es `transferir_propiedad`.
 *
 * Vive en el servidor y no en una función de Postgres porque el borrado toca
 * tres sistemas que Postgres no alcanza: Flow (la suscripción), R2 (las
 * imágenes) y Supabase Auth (las credenciales).
 *
 * El ORDEN es lo importante, y va de lo reversible a lo irreversible:
 *
 *   1. Verificar la contraseña. Una sesión robada o un equipo sin bloquear no
 *      alcanzan para destruir la empresa entera.
 *   2. Cancelar la suscripción en Flow. Va PRIMERO que el borrado: si el
 *      workspace desaparece antes, queda un cobro recurrente vivo y ya no hay
 *      fila que lo relacione con un cliente. Si Flow falla, se aborta acá y no
 *      se borró nada.
 *   3. Juntar las URLs de R2 mientras las filas todavía existen. Después del
 *      DELETE no hay forma de saber qué archivos eran de este workspace: las
 *      claves de R2 son `carpeta/uuid.ext`, sin el workspace en la ruta.
 *   4. Borrar las filas (RPC `eliminar_workspace`, en una transacción).
 *   5. Borrar los objetos de R2 y las cuentas de Auth. Van al final porque un
 *      fallo acá deja basura, no inconsistencia: las filas ya no existen.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminSupabase, serverSupabase } from "../../suscripcion/_helpers";
import { flow, FlowError } from "@/lib/flow";

/** Lo que el owner tiene que escribir para confirmar. */
const FRASE_CONFIRMACION = "ELIMINAR";

export async function POST(req: Request) {
  // ── 1. Autenticación y rol ────────────────────────────────────────────────
  const sb = await serverSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { data: perfil } = await sb
    .from("usuarios")
    .select("rol, workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.workspace_id) {
    return NextResponse.json({ error: "Usuario sin espacio de trabajo." }, { status: 400 });
  }
  if (perfil.rol !== "owner") {
    return NextResponse.json(
      { error: "Solo el propietario puede eliminar el espacio de trabajo." },
      { status: 403 },
    );
  }
  const workspaceId = perfil.workspace_id;

  const body = await req.json().catch(() => ({} as { password?: string; confirmacion?: string }));

  if (body.confirmacion?.trim().toUpperCase() !== FRASE_CONFIRMACION) {
    return NextResponse.json(
      { error: `Escribe ${FRASE_CONFIRMACION} para confirmar.` },
      { status: 400 },
    );
  }
  if (!body.password) {
    return NextResponse.json({ error: "Ingresa tu contraseña." }, { status: 400 });
  }

  // ── 2. Verificar la contraseña ────────────────────────────────────────────
  // Cliente aparte, sin persistir sesión: `signInWithPassword` sobre el cliente
  // de cookies rotaría la sesión del owner en mitad del borrado.
  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: pwErr } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: body.password,
  });
  if (pwErr) {
    return NextResponse.json({ error: "La contraseña no es correcta." }, { status: 401 });
  }

  const admin = adminSupabase();

  // ── 3. Cancelar la suscripción en Flow ────────────────────────────────────
  // Inmediata (`at_period_end: 0`): el workspace deja de existir, no tiene
  // sentido conservar acceso hasta fin de período.
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, flow_subscription_id, status")
    .eq("workspace_id", workspaceId)
    .neq("status", "canceled")
    .maybeSingle();

  if (sub?.flow_subscription_id) {
    try {
      await flow.cancelSubscription({
        subscriptionId: sub.flow_subscription_id,
        at_period_end: 0,
      });
    } catch (err) {
      const fe = err as FlowError;
      console.error("[workspace/eliminar] flow cancel", fe);
      // Abortar: es preferible un workspace vivo a un cobro huérfano.
      return NextResponse.json(
        { error: "No pudimos cancelar tu suscripción. No se eliminó nada. Inténtalo nuevamente o escríbenos." },
        { status: 502 },
      );
    }
    await admin
      .from("subscriptions")
      .update({ status: "canceled", canceled_at: new Date().toISOString() })
      .eq("id", sub.id);
  }

  // ── 4. Juntar las URLs de R2 antes de borrar las filas ────────────────────
  const urls = await recolectarUrls(admin, workspaceId);

  // Las cuentas de Auth también hay que listarlas ahora: después del DELETE ya
  // no queda quién pertenecía a este workspace.
  const { data: miembros } = await admin
    .from("usuarios")
    .select("id")
    .eq("workspace_id", workspaceId);
  const miembroIds = (miembros ?? []).map(m => m.id);

  // ── 5. Borrar las filas ───────────────────────────────────────────────────
  const { error: delErr } = await admin.rpc("eliminar_workspace", { p_workspace: workspaceId });
  if (delErr) {
    console.error("[workspace/eliminar] rpc", delErr);
    return NextResponse.json(
      { error: "No se pudo eliminar el espacio de trabajo. No se borró nada." },
      { status: 500 },
    );
  }

  // ── 6. Limpieza best-effort ───────────────────────────────────────────────
  // Las filas ya no existen: si algo de esto falla queda basura, no
  // inconsistencia. Por eso se registra y no se devuelve error.
  await Promise.allSettled([
    borrarDeR2(urls),
    ...miembroIds.map(id => admin.auth.admin.deleteUser(id)),
  ]);

  return NextResponse.json({ ok: true });
}

type Admin = ReturnType<typeof adminSupabase>;

/**
 * Junta todas las URLs de R2 que cuelgan de este workspace. Las claves de R2
 * son `carpeta/uuid.ext` — sin el workspace en la ruta— así que no hay borrado
 * por prefijo: la única forma de saber qué archivos son suyos es leerlos de las
 * columnas antes de que las filas desaparezcan.
 */
async function recolectarUrls(admin: Admin, workspaceId: string): Promise<string[]> {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v.startsWith("http")) out.add(v);
  };

  const [ots, activos, ws, grupos] = await Promise.all([
    admin.from("ordenes_trabajo")
      .select("id, fotos_urls, imagen_url, cliente_firma_url")
      .eq("workspace_id", workspaceId),
    admin.from("activos")
      .select("imagen_url, archivo_url, adjuntos")
      .eq("workspace_id", workspaceId),
    admin.from("workspaces").select("logo_url").eq("id", workspaceId).maybeSingle(),
    admin.from("foto_grupos").select("id").eq("workspace_id", workspaceId),
  ]);

  for (const ot of ots.data ?? []) {
    add(ot.imagen_url);
    add(ot.cliente_firma_url);
    for (const u of (ot.fotos_urls as string[] | null) ?? []) add(u);
  }
  for (const a of activos.data ?? []) {
    add(a.imagen_url);
    add(a.archivo_url);
    // `adjuntos` es jsonb: una lista de { url, nombre, ... } con archivos de R2.
    for (const adj of (a.adjuntos as { url?: string }[] | null) ?? []) add(adj?.url);
  }
  add((ws.data as { logo_url?: string } | null)?.logo_url);
  // actividad_ot y procedimiento_ejecuciones se recorren por orden_id, no por
  // workspace_id: en ambas esa columna se denormalizó después y es nullable, así
  // que las filas viejas la tienen en NULL y quedarían fuera del barrido.
  const otIds = (ots.data ?? []).map(o => o.id);
  for (let i = 0; i < otIds.length; i += 200) {
    const lote = otIds.slice(i, i + 200);
    const [act, ejec] = await Promise.all([
      admin.from("actividad_ot").select("foto_url").in("orden_id", lote),
      admin.from("procedimiento_ejecuciones").select("id").in("orden_id", lote),
    ]);
    for (const a of act.data ?? []) add(a.foto_url);
    const ejecIds = (ejec.data ?? []).map(e => e.id);
    if (ejecIds.length) {
      const { data } = await admin.from("paso_respuestas").select("foto_url").in("ejecucion_id", ejecIds);
      for (const r of data ?? []) add(r.foto_url);
    }
  }

  // foto_grupo_items y paso_respuestas no tienen workspace_id: se llegan por su
  // padre, que sí lo tiene.
  const grupoIds = (grupos.data ?? []).map(g => g.id);
  if (grupoIds.length) {
    const { data } = await admin.from("foto_grupo_items").select("url").in("grupo_id", grupoIds);
    for (const i of data ?? []) add(i.url);
  }

  return [...out];
}

/**
 * Borra los objetos de R2 uno por uno — la función `r2-delete` recibe una URL
 * por llamada. Se va de a tandas para no abrir cientos de conexiones a la vez.
 */
async function borrarDeR2(urls: string[]): Promise<void> {
  const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/r2-delete`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const TANDA = 20;

  for (let i = 0; i < urls.length; i += TANDA) {
    await Promise.allSettled(
      urls.slice(i, i + TANDA).map(url =>
        fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            apikey: key,
          },
          body: JSON.stringify({ url }),
        }),
      ),
    );
  }
}
