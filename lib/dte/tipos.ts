/**
 * Tipos del dominio de documentos tributarios electrónicos (DTE).
 *
 * La emisión concreta vive detrás de la interfaz `EmisorDTE` (ver emisor.ts):
 * hoy la implementación es manual —el documento se emite a mano en el portal
 * MIPYME del SII y acá solo se registra—, y mañana puede ser un proveedor con
 * API (SimpleFactura, LibreDTE, Nubox) sin tocar a los llamadores.
 */

/** Tipos de DTE del SII que Pangui emite. */
export const TIPO_DTE = {
  /** Factura electrónica afecta a IVA. Receptor con giro; da crédito fiscal. */
  FACTURA_AFECTA: 33,
  /** Boleta electrónica de venta afecta. Consumidor final. */
  BOLETA_AFECTA: 39,
  /** Nota de crédito: anula o rebaja un documento ya emitido. */
  NOTA_CREDITO: 61,
} as const;

export type TipoDte = (typeof TIPO_DTE)[keyof typeof TIPO_DTE];

export type EstadoDocumento = "pendiente" | "emitido" | "anulado" | "error";

export type TipoReceptor = "empresa" | "persona";

/** Datos del receptor, congelados en el documento al emitir. */
export interface ReceptorDte {
  rut:          string;
  razonSocial:  string;
  giro:         string | null;
  direccion:    string | null;
  comuna:       string | null;
  ciudad:       string | null;
  email:        string | null;
}

/** Lo necesario para registrar un documento por un período de suscripción. */
export interface SolicitudDocumento {
  workspaceId:        string;
  subscriptionId:     string | null;
  tipoDte:            TipoDte;
  periodoInicio:      string;   // YYYY-MM-DD
  periodoFin:         string;   // YYYY-MM-DD
  usuariosFacturados: number;
  precioUnitarioClp:  number;   // bruto por usuario, IVA incluido
  receptor:           ReceptorDte;
  flowInvoiceId?:     string | null;
}

/** Documento tal como queda en la base. */
export interface DocumentoTributario {
  id:                 string;
  /** Null si el workspace fue borrado: el documento sobrevive igual, con los
   *  datos del receptor congelados en el propio registro. */
  workspaceId:        string | null;
  subscriptionId:     string | null;
  tipoDte:            TipoDte;
  folio:              number | null;
  periodoInicio:      string;
  periodoFin:         string;
  netoClp:            number;
  ivaClp:             number;
  totalClp:           number;
  usuariosFacturados: number;
  precioUnitarioClp:  number;
  estado:             EstadoDocumento;
  emitidoAt:          string | null;
  flowInvoiceId:      string | null;
  nota:               string | null;
}

/**
 * El tipo de DTE que corresponde según el receptor.
 *
 * Una empresa con giro recibe factura (y usa el IVA como crédito fiscal); un
 * consumidor final recibe boleta de venta. La distinción no es cosmética: al
 * SII se declaran en registros distintos.
 */
export function tipoDtePara(tipoReceptor: TipoReceptor): TipoDte {
  return tipoReceptor === "persona" ? TIPO_DTE.BOLETA_AFECTA : TIPO_DTE.FACTURA_AFECTA;
}

/** Nombre legible del documento, para la UI y los textos legales. */
export function nombreDte(tipo: TipoDte): string {
  switch (tipo) {
    case TIPO_DTE.FACTURA_AFECTA: return "Factura electrónica";
    case TIPO_DTE.BOLETA_AFECTA:  return "Boleta electrónica";
    case TIPO_DTE.NOTA_CREDITO:   return "Nota de crédito";
  }
}
