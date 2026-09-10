"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Pencil, Check, X, Send, PackageCheck, Loader2, FileDown, Truck,
  AlertTriangle, CalendarDays, DollarSign, FileText,
} from "lucide-react";
import { formatearCLP } from "@/lib/tributario";
import {
  listLineas, aprobarOC, rechazarOC, enviarAAprobacion, registrarRecepcion,
  descargarPDF, enviarAlProveedor, confirmarPrecios,
} from "@/lib/ordenes-compra-api";
import AuditFooter from "@/components/catalogo/AuditFooter";
import {
  btnSecundario as btn, btnPrimarioDetalle as btnPrimario, seccionDetalle,
} from "@/components/catalogo/PanelCatalogo";
import { ESTADO_OC_LABELS, ESTADO_OC_COLOR } from "@/types/ordenes-compra";
import type { OrdenCompra, OrdenCompraLinea } from "@/types/ordenes-compra";

/** Fechas 'date' de Postgres: se parten a mano para no pasar por el parser de
 *  Date, que interpreta "2026-10-01" como UTC y puede restar un día. */
function fechaCorta(fecha: string | null): string {
  if (!fecha) return "—";
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CL", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export default function OCDetalle({ oc, isAdmin, onEdit, onCambio }: {
  oc: OrdenCompra;
  isAdmin: boolean;
  onEdit: () => void;
  onCambio: () => void;
}) {
  const queryClient = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recibiendo, setRecibiendo] = useState(false);
  const [porRecibir, setPorRecibir] = useState<Record<string, number>>({});

  /**
   * Lineas de la orden, cacheadas.
   *
   * Antes esto era un efecto propio, y ademas la pagina las volvia a pedir al
   * abrir el panel de edicion: abrir cinco ordenes costaba quince viajes. Una
   * OC cerrada (completada, cancelada o rechazada) ya es historia y no cambia,
   * asi que aguanta una hora en cache; una en curso, dos minutos.
   */
  const cerrada = oc.estado === "completada" || oc.estado === "cancelada" || oc.estado === "rechazada";
  const lineasQuery = useQuery({
    queryKey: ["oc-lineas", oc.id],
    queryFn: () => listLineas(oc.id),
    staleTime: cerrada ? 60 * 60 * 1000 : 2 * 60 * 1000,
  });
  const lineas = lineasQuery.data ?? [];
  const cargando = lineasQuery.isLoading;

  async function accion(fn: () => Promise<void>) {
    setOcupado(true); setError(null);
    try { await fn(); onCambio(); }
    catch (e) { setError((e as Error).message); }
    finally { setOcupado(false); }
  }

  // Aparte de `accion`: descargar no cambia nada, así que no toca refrescar.
  async function handlePDF() {
    setOcupado(true); setError(null);
    try { await descargarPDF(oc.id); }
    catch (e) { setError((e as Error).message); }
    finally { setOcupado(false); }
  }

  async function confirmarRecepcion() {
    const items = Object.entries(porRecibir)
      .map(([linea_id, cantidad]) => ({ linea_id, cantidad: Number(cantidad) }))
      .filter(r => r.cantidad > 0);
    if (items.length === 0) return;
    await accion(async () => {
      await registrarRecepcion(oc.id, items);
      setRecibiendo(false);
      setPorRecibir({});
      // Recibir cambia las cantidades recibidas de cada linea: se invalida el
      // cache en vez de re-pedirlas a mano, para que sea la misma consulta.
      await queryClient.invalidateQueries({ queryKey: ["oc-lineas", oc.id] });
    });
  }

  const editable = oc.estado === "borrador" || oc.estado === "pendiente_aprobacion";
  const recibible = oc.estado === "enviada" || oc.estado === "recibida_parcial";
  const numero = oc.numero_manual || (oc.numero != null ? `#${oc.numero}` : "—");

  return (
    // Inset de 28px y ancho de 1100, los mismos de OTDetail.
    <div style={{ padding: "0 28px 76px", width: "100%", boxSizing: "border-box" }}>

      {/* Cabecera */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 14,
        marginLeft: -28, marginRight: -28, paddingLeft: 28, paddingRight: 28,
        paddingTop: 24, paddingBottom: 24, marginBottom: 0,
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 20px y peso 500: es el unico texto que rompe el 14px, si no el
              detalle no tiene jerarquia. */}
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--fg-1)", margin: 0, lineHeight: 1.3 }}>
            Orden de compra {numero}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{
              fontSize: 14, color: ESTADO_OC_COLOR[oc.estado],
              background: "var(--surface-hover)", padding: "2px 8px", borderRadius: "var(--r-sm)",
            }}>
              {ESTADO_OC_LABELS[oc.estado]}
            </span>
            {oc.origen === "plan_mantencion" && (
              // Enlaza al plan que la generó: si no, no hay forma de saber cuál
              // fue. Sin `plan_id` (no debería pasar) queda como texto plano en
              // vez de un enlace muerto.
              oc.plan_id ? (
                <a
                  href={`/planes?id=${oc.plan_id}`}
                  style={{ fontSize: 14, color: "var(--brand-fg)", textDecoration: "none" }}
                >
                  Generada por un plan
                </a>
              ) : (
                <span style={{ fontSize: 14, color: "var(--fg-3)" }}>Generada por un plan</span>
              )
            )}
          </div>
        </div>

        {isAdmin && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {editable && (
              <button onClick={onEdit} style={btnPrimario}><Pencil size={14} /> Editar</button>
            )}
            {oc.estado === "borrador" && (
              <button onClick={() => accion(() => enviarAAprobacion(oc.id))} disabled={ocupado} style={btn}>
                Enviar a aprobación
              </button>
            )}
            {oc.estado === "pendiente_aprobacion" && (
              <>
                <button
                  onClick={() => accion(() => aprobarOC(oc.id))}
                  // Aprobar es lo que habilita el envio. Una OC declara "precios
                  // acordados": no se puede aprobar sobre precios de catalogo
                  // que nadie confirmo con el proveedor.
                  disabled={ocupado || !oc.precios_confirmados}
                  title={oc.precios_confirmados ? undefined : "Confirma los precios antes de aprobar"}
                  style={{ ...btnPrimario, opacity: oc.precios_confirmados ? 1 : 0.5 }}
                >
                  <Check size={14} /> Aprobar
                </button>
                <button
                  onClick={() => {
                    const motivo = prompt("¿Por qué se rechaza esta orden de compra?");
                    if (motivo != null) accion(() => rechazarOC(oc.id, motivo));
                  }}
                  disabled={ocupado}
                  style={btn}
                >
                  <X size={14} /> Rechazar
                </button>
              </>
            )}
            {oc.estado === "aprobada" && (
              <button
                onClick={() => {
                  const dest = oc.proveedor?.email;
                  if (!dest) {
                    setError("El proveedor no tiene correo registrado. Agrégalo en Proveedores.");
                    return;
                  }
                  if (!confirm(`Se enviará la orden de compra a ${dest} con el PDF adjunto.`)) return;
                  accion(async () => { await enviarAlProveedor(oc.id); });
                }}
                disabled={ocupado}
                style={btnPrimario}
              >
                <Send size={14} /> Enviar al proveedor
              </button>
            )}
            {recibible && (
              <button onClick={() => setRecibiendo(v => !v)} style={btn}>
                <PackageCheck size={14} /> Registrar recepción
              </button>
            )}
            <button
              onClick={handlePDF}
              disabled={ocupado}
              style={btn}
            >
              <FileDown size={14} /> PDF
            </button>
          </div>
        )}
      </div>

      {!oc.precios_confirmados && (
        /* Mismo aviso que los banners de OTDetail: tarjeta blanca con borde
           gris de 1px. El color de aviso queda en el icono y el titulo, no en
           el fondo. `marginTop` lo despega de la regla de la cabecera. */
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14,
          background: "var(--surface-1)", color: "var(--fg-1)",
          padding: "16px 18px", borderRadius: "var(--r-md)",
          marginTop: 22, marginBottom: 16,
          border: "1px solid var(--border)",
        }}>
          <AlertTriangle size={16} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ color: "var(--warning)" }}>Precios tomados del inventario, sin confirmar con el proveedor.</div>
            <div style={{ color: "var(--fg-3)", marginTop: 2 }}>
              Una orden de compra declara precios acordados. Revísalos contra la cotización antes de aprobarla.
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => {
                const numero = prompt("N° de cotización del proveedor (opcional):");
                if (numero === null) return;
                const fecha = prompt("Fecha de la cotización (AAAA-MM-DD, opcional):");
                if (fecha === null) return;
                accion(() => confirmarPrecios(oc.id, { numero, fecha }));
              }}
              disabled={ocupado}
              style={{ ...btn, flexShrink: 0 }}
            >
              <Check size={14} /> Confirmar precios
            </button>
          )}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 14, background: "var(--surface-1)", color: "var(--danger)", padding: "16px 18px", borderRadius: "var(--r-md)", marginBottom: 16, border: "1px solid var(--border)" }}>
          {error}
        </div>
      )}

      {/* Datos. Apilados con el ritmo de 14px del FieldRow en vez de la grilla
          rigida de dos columnas que habia antes, y la seccion se cierra con
          una regla gris al ancho del panel. */}
      <div style={seccionDetalle}>
        <Dato icon={<Truck size={16} />} label="Proveedor"
          valor={oc.proveedor?.nombre ?? "Sin proveedor"}
          sub={oc.proveedor?.rut ?? null} />
        <Dato icon={<CalendarDays size={16} />} label="Entrega esperada" valor={fechaCorta(oc.fecha_entrega_esperada)} />
        <Dato icon={<CalendarDays size={16} />} label="Emisión" valor={fechaCorta(oc.fecha_emision)} />
        <Dato icon={<DollarSign size={16} />} label="Condiciones de pago" valor={oc.condiciones_pago || "—"} />
        {oc.cotizacion_numero && (
          <Dato icon={<FileText size={16} />} label="Cotización"
            valor={`N° ${oc.cotizacion_numero}${oc.cotizacion_fecha ? ` · ${fechaCorta(oc.cotizacion_fecha)}` : ""}`} />
        )}
      </div>

      {oc.rechazada_motivo && (
        <div style={{ fontSize: 14, background: "var(--surface-1)", color: "var(--danger)", padding: "16px 18px", borderRadius: "var(--r-md)", marginBottom: 16, border: "1px solid var(--border)" }}>
          Rechazada: {oc.rechazada_motivo}
        </div>
      )}

      {/* Líneas */}
      <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", margin: "16px 0 8px" }}>Detalle</p>
      {cargando ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
          <Loader2 size={18} className="animate-spin" style={{ color: "var(--fg-4)" }} />
        </div>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden", marginBottom: 16 }}>
          {lineas.map((l, i) => {
            const pendiente = l.cantidad - l.cantidad_recibida;
            return (
              <div key={l.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, color: "var(--fg-1)" }}>{l.descripcion}</span>
                  <span style={{ display: "block", fontSize: 14, color: "var(--fg-3)" }}>
                    {l.codigo ? `${l.codigo} · ` : ""}{l.cantidad} {l.unidad} × {formatearCLP(l.precio_unitario)}
                    {l.cantidad_recibida > 0 && ` · recibido ${l.cantidad_recibida}`}
                  </span>
                </span>

                {recibiendo && pendiente > 0 && (
                  <input
                    type="number" min={0} max={pendiente} step="any"
                    placeholder={String(pendiente)}
                    value={porRecibir[l.id] ?? ""}
                    onChange={e => setPorRecibir(p => ({ ...p, [l.id]: Number(e.target.value) }))}
                    style={{
                      width: 80, height: 32, padding: "0 8px", border: "1px solid var(--border)",
                      borderRadius: "var(--r-sm)", fontSize: 14, background: "var(--surface-1)",
                      color: "var(--fg-1)", outline: "none", fontFamily: "inherit",
                    }}
                    aria-label={`Cantidad recibida de ${l.descripcion}`}
                  />
                )}

                <span style={{ fontSize: 14, color: "var(--fg-1)", width: 110, textAlign: "right" }}>
                  {formatearCLP(l.total)}
                </span>
              </div>
            );
          })}
          {lineas.length === 0 && (
            <div style={{ padding: 16, fontSize: 14, color: "var(--fg-3)" }}>Sin líneas.</div>
          )}
        </div>
      )}

      {recibiendo && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={confirmarRecepcion} disabled={ocupado} style={btnPrimario}>
            {ocupado ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
            Confirmar recepción
          </button>
          <button onClick={() => { setRecibiendo(false); setPorRecibir({}); }} style={btn}>Cancelar</button>
        </div>
      )}

      {/* Totales */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <div style={{ width: 260, display: "flex", flexDirection: "column", gap: 4 }}>
          <Total label="Neto" valor={oc.neto} />
          {oc.descuento > 0 && <Total label="Descuento" valor={-oc.descuento} />}
          {oc.otros_costos > 0 && <Total label="Otros" valor={oc.otros_costos} />}
          <Total label="IVA 19%" valor={oc.iva} />
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 4 }}>
            <Total label="Total" valor={oc.total} fuerte />
          </div>
        </div>
      </div>

      {oc.observaciones && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 14, color: "var(--fg-3)", margin: "0 0 4px" }}>Observaciones</p>
          <p style={{ fontSize: 14, color: "var(--fg-1)", margin: 0, whiteSpace: "pre-wrap" }}>{oc.observaciones}</p>
        </div>
      )}

      <div style={{ ...seccionDetalle, paddingTop: 20, paddingBottom: 20 }}>
        <AuditFooter creador={oc.creador} creadoEn={oc.created_at} actualizador={oc.actualizador} actualizadoEn={oc.updated_at} />
      </div>
    </div>
  );
}

function Total({ label, valor, fuerte }: { label: string; valor: number; fuerte?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
      <span style={{ color: fuerte ? "var(--fg-1)" : "var(--fg-3)" }}>{label}</span>
      <span style={{ color: "var(--fg-1)" }}>{formatearCLP(valor)}</span>
    </div>
  );
}

/** Un dato del detalle: rótulo arriba, valor abajo, ícono en la canaleta. */
function Dato({ icon, label, valor, sub }: {
  icon: React.ReactNode;
  label: string;
  valor: string;
  sub?: string | null;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "14px 0" }}>
      <div style={{ width: 16, paddingTop: 3, display: "flex", justifyContent: "flex-start", flexShrink: 0, color: "var(--brand)" }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", marginBottom: 8 }}>
          {label}
        </span>
        <span style={{ display: "block", fontSize: 14, color: "var(--fg-2)", lineHeight: 1.75 }}>{valor}</span>
        {sub && <span style={{ display: "block", fontSize: 14, color: "var(--fg-3)" }}>{sub}</span>}
      </div>
    </div>
  );
}
