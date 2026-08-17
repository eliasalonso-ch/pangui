/**
 * Registra el documento tributario de un período de suscripción cobrado.
 *
 * Lo llama el webhook de Flow cuando un período queda pagado. Junta las tres
 * piezas que el documento necesita —período, cantidad de usuarios cobrados y
 * datos del receptor— y delega la escritura en el `EmisorDTE`.
 *
 * Nunca lanza: un fallo acá no debe romper el webhook ni impedir que la
 * suscripción se actualice. Si algo sale mal, el período aparece en la segunda
 * consulta de `scripts/facturas-pendientes.sql`, que existe justamente como red
 * de seguridad.
 */
import { EmisorManual, DocumentoDuplicadoError, type ClienteAdmin } from "./emisor";
import { periodoAFacturar, type EntradaPeriodo } from "./periodo-facturable";
import { tipoDtePara, type TipoReceptor } from "./tipos";

export interface ContextoPeriodo extends EntradaPeriodo {
  workspaceId:      string;
  subscriptionId:   string;
  precioPorUsuario: number;
  flowInvoiceId?:   string | null;
}

/**
 * Registra el documento si corresponde. Devuelve el id del documento creado,
 * o null si no había nada que facturar o si falló (ya logueado).
 */
export async function registrarPeriodoFacturado(
  admin: ClienteAdmin,
  ctx: ContextoPeriodo,
): Promise<string | null> {
  const periodo = periodoAFacturar(ctx);
  if (!periodo) return null;

  if (!ctx.precioPorUsuario || ctx.precioPorUsuario <= 0) {
    // Plan gratis o enterprise facturado fuera de la plataforma.
    return null;
  }

  try {
    // Usuarios cobrados: los mismos criterios que lib/flow-sync.ts usa para
    // calcular el cargo. Si esto divergiera, la factura no cuadraría con lo
    // que Flow cobró.
    const { count } = await admin
      .from("usuarios")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspaceId)
      .eq("activo", true)
      .eq("excluir_de_facturacion", false)
      .is("deleted_at", null);

    const usuarios = count ?? 0;
    if (usuarios === 0) return null;

    const { data: perfil } = await admin
      .from("billing_profiles")
      .select("billing_email, razon_social, rut, giro, domicilio, region, comuna, ciudad, tipo_receptor")
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();

    // Se registra aunque el perfil esté incompleto: el cobro ya ocurrió y el
    // documento debe existir. Los campos faltantes quedan null y se ven en
    // facturas-pendientes.sql marcados con ⚠ antes de emitir en el SII.
    const tipoReceptor = (perfil?.tipo_receptor as TipoReceptor | undefined) ?? "empresa";

    const documento = await new EmisorManual(admin).registrar({
      workspaceId:        ctx.workspaceId,
      subscriptionId:     ctx.subscriptionId,
      tipoDte:            tipoDtePara(tipoReceptor),
      periodoInicio:      periodo.periodoInicio,
      periodoFin:         periodo.periodoFin,
      usuariosFacturados: usuarios,
      precioUnitarioClp:  ctx.precioPorUsuario,
      flowInvoiceId:      ctx.flowInvoiceId ?? null,
      receptor: {
        rut:         String(perfil?.rut ?? ""),
        razonSocial: String(perfil?.razon_social ?? ""),
        giro:        perfil?.giro       ? String(perfil.giro)       : null,
        direccion:   perfil?.domicilio  ? String(perfil.domicilio)  : null,
        comuna:      perfil?.comuna     ? String(perfil.comuna)     : null,
        ciudad:      perfil?.ciudad     ? String(perfil.ciudad)     : null,
        email:       perfil?.billing_email ? String(perfil.billing_email) : null,
      },
    });

    return documento.id;
  } catch (err) {
    if (err instanceof DocumentoDuplicadoError) {
      // El período ya tenía documento. Es el caso normal de una reentrega que
      // pasó el candado de idempotencia por tener otra clave (p.ej. Flow mandó
      // el mismo período con next_invoice_date distinto).
      console.info("[dte] período ya facturado:", periodo.periodoInicio, "→", periodo.periodoFin);
      return null;
    }
    // No se propaga: el webhook debe seguir actualizando la suscripción.
    console.error("[dte] no se pudo registrar el documento del período:", err);
    return null;
  }
}
