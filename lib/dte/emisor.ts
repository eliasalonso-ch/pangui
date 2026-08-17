/**
 * Emisión de documentos tributarios.
 *
 * La interfaz `EmisorDTE` separa QUÉ hay que emitir (dominio de Pangui) de
 * CÓMO se emite (portal del SII a mano, o un proveedor con API). Hoy solo
 * existe `EmisorManual`; cuando la emisión manual deje de escalar, se agrega
 * `EmisorSimpleFactura` (o el proveedor que sea) implementando esta misma
 * interfaz y los llamadores no cambian.
 *
 * Lo que NO hace el emisor manual: emitir. El documento se emite en
 * https://www.sii.cl → Factura Electrónica → Portal MIPYME. Acá se registra
 * qué corresponde emitir y, después, con qué folio quedó — de modo que la base
 * sepa siempre qué períodos están facturados y cuáles no.
 */
import { desglosarCobroSuscripcion } from "@/lib/tributario";
import type {
  DocumentoTributario,
  SolicitudDocumento,
} from "./tipos";

/**
 * Cliente Supabase con service role, en su forma mínima.
 *
 * Se inyecta para poder testear sin red. El tipo es deliberadamente laxo: el
 * cliente real de `@supabase/supabase-js` devuelve `PostgrestBuilder`, que es
 * thenable pero no una `Promise`, y encadena métodos en un orden que ningún
 * tipo estructural razonable reproduce. Modelar cada eslabón obligaba a
 * castear en el llamador, que es peor: escondería errores reales de uso.
 * Los dobles de test sí implementan la forma concreta que cada método usa.
 */
export interface ClienteAdmin {
  from(tabla: string): any;
}

/** Fila devuelta por PostgREST tras un insert/update con .select().single(). */
type RespuestaFila = {
  data: Record<string, unknown> | null;
  error: { message: string; code?: string } | null;
};

export interface EmisorDTE {
  /**
   * Registra el documento que corresponde emitir por un período cobrado.
   * Calcula el desglose tributario y lo deja en estado `pendiente`.
   */
  registrar(solicitud: SolicitudDocumento): Promise<DocumentoTributario>;

  /**
   * Marca un documento como emitido con el folio que asignó el SII.
   * En el emisor manual lo llama una persona tras emitir en el portal; en un
   * emisor con API lo llama el propio flujo de emisión.
   */
  confirmarEmision(documentoId: string, folio: number): Promise<DocumentoTributario>;

  /** Marca un documento como fallido, con el motivo. */
  marcarError(documentoId: string, motivo: string): Promise<DocumentoTributario>;
}

const COLUMNAS =
  "id, workspace_id, subscription_id, tipo_dte, folio, periodo_inicio, periodo_fin, " +
  "neto_clp, iva_clp, total_clp, usuarios_facturados, precio_unitario_clp, estado, " +
  "emitido_at, flow_invoice_id, nota";

function aDominio(fila: Record<string, unknown>): DocumentoTributario {
  return {
    id:                 String(fila.id),
    workspaceId:        fila.workspace_id ? String(fila.workspace_id) : null,
    subscriptionId:     fila.subscription_id ? String(fila.subscription_id) : null,
    tipoDte:            Number(fila.tipo_dte) as DocumentoTributario["tipoDte"],
    folio:              fila.folio == null ? null : Number(fila.folio),
    periodoInicio:      String(fila.periodo_inicio),
    periodoFin:         String(fila.periodo_fin),
    netoClp:            Number(fila.neto_clp),
    ivaClp:             Number(fila.iva_clp),
    totalClp:           Number(fila.total_clp),
    usuariosFacturados: Number(fila.usuarios_facturados),
    precioUnitarioClp:  Number(fila.precio_unitario_clp),
    estado:             fila.estado as DocumentoTributario["estado"],
    emitidoAt:          fila.emitido_at ? String(fila.emitido_at) : null,
    flowInvoiceId:      fila.flow_invoice_id ? String(fila.flow_invoice_id) : null,
    nota:               fila.nota ? String(fila.nota) : null,
  };
}

/** Código de Postgres para violación de índice único. */
const UNIQUE_VIOLATION = "23505";

export class DocumentoDuplicadoError extends Error {
  constructor(periodoInicio: string, periodoFin: string) {
    super(`Ya existe un documento para el período ${periodoInicio} → ${periodoFin}.`);
    this.name = "DocumentoDuplicadoError";
  }
}

/**
 * Emisor manual: registra en la base, no habla con el SII.
 *
 * El documento queda `pendiente` hasta que alguien lo emite en el portal
 * MIPYME y confirma el folio. `scripts/facturas-pendientes.sql` lista
 * exactamente lo que falta emitir.
 */
export class EmisorManual implements EmisorDTE {
  constructor(private readonly admin: ClienteAdmin) {}

  async registrar(solicitud: SolicitudDocumento): Promise<DocumentoTributario> {
    // El desglose se calcula sobre el total del período, no por usuario: ver
    // la justificación del redondeo en lib/tributario.ts.
    const montos = desglosarCobroSuscripcion(
      solicitud.precioUnitarioClp,
      solicitud.usuariosFacturados,
    );

    const { data, error } = await this.admin
      .from("documentos_tributarios")
      .insert({
        workspace_id:          solicitud.workspaceId,
        subscription_id:       solicitud.subscriptionId,
        tipo_dte:              solicitud.tipoDte,
        periodo_inicio:        solicitud.periodoInicio,
        periodo_fin:           solicitud.periodoFin,
        neto_clp:              montos.neto,
        iva_clp:               montos.iva,
        total_clp:             montos.bruto,
        usuarios_facturados:   solicitud.usuariosFacturados,
        precio_unitario_clp:   solicitud.precioUnitarioClp,
        receptor_rut:          solicitud.receptor.rut,
        receptor_razon_social: solicitud.receptor.razonSocial,
        receptor_giro:         solicitud.receptor.giro,
        receptor_direccion:    solicitud.receptor.direccion,
        receptor_comuna:       solicitud.receptor.comuna,
        receptor_ciudad:       solicitud.receptor.ciudad,
        receptor_email:        solicitud.receptor.email,
        estado:                "pendiente",
        flow_invoice_id:       solicitud.flowInvoiceId ?? null,
      })
      .select(COLUMNAS)
      .single() as RespuestaFila;

    if (error) {
      // El índice único por período convierte un doble cobro en un error
      // explícito en vez de una segunda factura por el mismo servicio.
      if (error.code === UNIQUE_VIOLATION) {
        throw new DocumentoDuplicadoError(solicitud.periodoInicio, solicitud.periodoFin);
      }
      throw new Error(`No se pudo registrar el documento tributario: ${error.message}`);
    }
    if (!data) throw new Error("No se pudo registrar el documento tributario.");
    return aDominio(data);
  }

  async confirmarEmision(documentoId: string, folio: number): Promise<DocumentoTributario> {
    if (!Number.isInteger(folio) || folio <= 0) {
      throw new Error(`Folio inválido: ${folio}`);
    }
    const { data, error } = await this.admin
      .from("documentos_tributarios")
      .update({
        folio,
        estado:     "emitido",
        emitido_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentoId)
      .select(COLUMNAS)
      .single() as RespuestaFila;

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        throw new Error(`El folio ${folio} ya está registrado en otro documento.`);
      }
      throw new Error(`No se pudo confirmar la emisión: ${error.message}`);
    }
    if (!data) throw new Error("Documento no encontrado.");
    return aDominio(data);
  }

  async marcarError(documentoId: string, motivo: string): Promise<DocumentoTributario> {
    const { data, error } = await this.admin
      .from("documentos_tributarios")
      .update({ estado: "error", nota: motivo, updated_at: new Date().toISOString() })
      .eq("id", documentoId)
      .select(COLUMNAS)
      .single() as RespuestaFila;

    if (error) throw new Error(`No se pudo marcar el error: ${error.message}`);
    if (!data) throw new Error("Documento no encontrado.");
    return aDominio(data);
  }
}
