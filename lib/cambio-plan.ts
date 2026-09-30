/**
 * Qué implica un cambio de plan, para poder advertirlo ANTES de ejecutarlo.
 *
 * Subir y bajar de plan no son simétricos, y esa diferencia es justo lo que el
 * usuario necesita saber antes de confirmar:
 *
 *   - SUBIR  → se aplica de inmediato en Flow y cobra la diferencia. No hay
 *              deshacer: volver atrás es una bajada, que recién toma efecto el
 *              ciclo siguiente.
 *   - BAJAR  → se agenda para el fin del período ya pagado. Es reversible en
 *              cualquier momento hasta esa fecha (ver
 *              /api/suscripcion/cancel-scheduled-plan).
 *
 * Este módulo es puro para poder probar los mensajes sin montar la pantalla.
 */
import { planByKey, costoMensual, type PlanKey } from "./flow-plans";
import { desglosarCobroSuscripcion, desglosarNeto, formatearCLP } from "./tributario";

export type TipoCambio = "subida" | "bajada" | "mismo";

export interface ContextoCambio {
  planActual:     PlanKey | string;
  planNuevo:      PlanKey | string;
  usuariosActivos: number;
  /** Fin del período pagado, ISO. Solo se usa en las bajadas. */
  periodoFin:     string | null;
  /** Precio negociado por usuario; los clientes fundadores lo conservan. */
  precioPorUsuario?: number | null;
}

export interface ResumenCambio {
  tipo:          TipoCambio;
  /** Título del diálogo de confirmación. */
  titulo:        string;
  /** Qué va a pasar, en una frase. */
  detalle:       string;
  /** Advertencia sobre lo irreversible, o null si el cambio se puede deshacer. */
  advertencia:   string | null;
  /** Texto del botón que confirma. */
  textoConfirmar: string;
  /** Cobro mensual actual y nuevo, con IVA incluido. */
  totalActual:   number;
  totalNuevo:    number;
  /** true si el cambio se puede revertir sin costo después de aplicarlo. */
  reversible:    boolean;
}

/** Compara dos planes por su precio base. */
export function tipoDeCambio(planActual: string, planNuevo: string): TipoCambio {
  if (planActual === planNuevo) return "mismo";
  const actual = planByKey(planActual).basePrice;
  const nuevo  = planByKey(planNuevo).basePrice;
  if (nuevo === actual) return "mismo";
  return nuevo > actual ? "subida" : "bajada";
}

/** Formatea una fecha de período (día calendario en UTC) para la UI. */
export function fechaEfectiva(iso: string | null): string {
  if (!iso) return "el fin del período actual";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "el fin del período actual";
  // timeZone UTC: los períodos se guardan a medianoche UTC y son días
  // calendario. En Chile (UTC−4) se mostrarían un día antes.
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "UTC",
  }).format(fecha);
}

/**
 * Arma el resumen que ve el usuario antes de confirmar.
 *
 * Los totales incluyen IVA porque es lo que se le cobra; el desglose vive en
 * el resumen legal de la pantalla, no en un diálogo de confirmación.
 */
export function resumirCambio(ctx: ContextoCambio): ResumenCambio {
  const tipo    = tipoDeCambio(ctx.planActual, ctx.planNuevo);
  const actual  = planByKey(ctx.planActual);
  const nuevo   = planByKey(ctx.planNuevo);
  const usuarios = Math.max(0, Math.trunc(ctx.usuariosActivos));

  // Un cliente fundador conserva su precio negociado por usuario al cambiar de
  // tier, así que su total no sale del catálogo. El resto paga la base del plan
  // más los usuarios que excedan los incluidos. Ver change-plan.
  const fundador = Boolean(ctx.precioPorUsuario && ctx.precioPorUsuario > 0);
  const total = (plan: typeof actual) => fundador
    ? desglosarCobroSuscripcion(ctx.precioPorUsuario as number, usuarios).bruto
    : desglosarNeto(costoMensual(plan, usuarios)).bruto;

  const totalActual = total(actual);
  const totalNuevo  = total(nuevo);

  if (tipo === "subida") {
    return {
      tipo,
      titulo: `Cambiar a ${nuevo.name}`,
      detalle:
        `El cambio se aplica ahora y tu cobro mensual pasa de ${formatearCLP(totalActual)} ` +
        `a ${formatearCLP(totalNuevo)} con ${usuarios} ${usuarios === 1 ? "usuario activo" : "usuarios activos"}. ` +
        `Flow.cl cobrará la diferencia a tu tarjeta.`,
      advertencia:
        "Este cambio es inmediato y no se puede deshacer. Si luego quieres volver a " +
        `${actual.name}, el cambio recién tomará efecto en el próximo ciclo.`,
      textoConfirmar: `Sí, cambiar a ${nuevo.name}`,
      totalActual,
      totalNuevo,
      reversible: false,
    };
  }

  if (tipo === "bajada") {
    return {
      tipo,
      titulo: `Bajar a ${nuevo.name}`,
      detalle:
        `Conservas ${actual.name} y todas sus funciones hasta el ${fechaEfectiva(ctx.periodoFin)}, ` +
        `porque ese período ya está pagado. Desde esa fecha pasas a ${nuevo.name} y tu cobro ` +
        `mensual baja de ${formatearCLP(totalActual)} a ${formatearCLP(totalNuevo)}.`,
      advertencia: null,
      textoConfirmar: `Sí, bajar a ${nuevo.name}`,
      totalActual,
      totalNuevo,
      reversible: true,
    };
  }

  return {
    tipo,
    titulo: "Sin cambios",
    detalle: `Ya estás en ${nuevo.name}.`,
    advertencia: null,
    textoConfirmar: "Entendido",
    totalActual,
    totalNuevo,
    reversible: true,
  };
}
