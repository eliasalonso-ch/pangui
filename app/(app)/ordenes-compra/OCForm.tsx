"use client";

import { useState, useEffect } from "react";
import {
  Truck, Hash, CalendarDays, DollarSign, FileText, MapPin, Package, Percent, Tag, UserRound,
} from "lucide-react";
import { useContactos } from "../proveedores/ProveedorContactos";
import { createClient } from "@/lib/supabase";
import {
  PanelCatalogo, FieldRow, inputStyle, textareaStyle, focoInput,
} from "@/components/catalogo/PanelCatalogo";
import SearchSelect from "@/components/catalogo/SearchSelect";
import { DatePicker } from "@/components/ui/date-time-picker";
// "YYYY-MM-DD" <-> Date local, sin pasar por toISOString (corre el día en Chile).
import { aFecha, deFecha } from "@/lib/analitica-rango";
import { formatearCLP } from "@/lib/tributario";
import { calcularTotales } from "@/lib/ordenes-compra-api";
import LineasPicker from "./LineasPicker";
import CostosPicker from "./CostosPicker";
import type { OrdenCompra, OrdenCompraForm, OrdenCompraLineaForm } from "@/types/ordenes-compra";

export default function OCForm({
  inicial, lineasIniciales, wsId, guardando, error, onCancel, onSubmit,
}: {
  inicial?: OrdenCompra | null;
  lineasIniciales?: OrdenCompraLineaForm[];
  wsId: string | null;
  guardando: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (v: OrdenCompraForm) => void;
}) {
  const [proveedores, setProveedores] = useState<{ id: string; label: string; sub?: string; condiciones_pago: string | null }[]>([]);
  const [v, setV] = useState<OrdenCompraForm>({
    proveedor_id: inicial?.proveedor_id ?? null,
    contacto_id: inicial?.contacto_id ?? null,
    numero_manual: inicial?.numero_manual ?? "",
    fecha_emision: inicial?.fecha_emision ?? new Date().toISOString().slice(0, 10),
    fecha_entrega_esperada: inicial?.fecha_entrega_esperada ?? "",
    direccion_despacho: inicial?.direccion_despacho ?? "",
    condiciones_pago: inicial?.condiciones_pago ?? "",
    descuento: inicial?.descuento ?? 0,
    otros_costos: inicial?.otros_costos ?? 0,
    costos: inicial?.costos ?? [],
    observaciones: inicial?.observaciones ?? "",
    cotizacion_numero: inicial?.cotizacion_numero ?? "",
    cotizacion_fecha: inicial?.cotizacion_fecha ?? "",
    lineas: lineasIniciales ?? [],
  });

  // Proveedores activos, más el de esta OC aunque esté archivado: si no, al
  // editarla el selector quedaba vacío y guardar le borraba el proveedor.
  const proveedorInicial = inicial?.proveedor_id ?? null;
  useEffect(() => {
    if (!wsId) return;
    let active = true;
    let q = createClient()
      .from("proveedores")
      .select("id, nombre, rut, condiciones_pago")
      .eq("workspace_id", wsId);
    q = proveedorInicial ? q.or(`activo.eq.true,id.eq.${proveedorInicial}`) : q.eq("activo", true);
    q.order("nombre").then(({ data }) => {
      if (!active) return;
      setProveedores((data ?? []).map((p: any) => ({
        id: p.id, label: p.nombre, sub: p.rut ?? undefined, condiciones_pago: p.condiciones_pago,
      })));
    });
    return () => { active = false; };
  }, [wsId, proveedorInicial]);

  const { data: contactos = [] } = useContactos(v.proveedor_id ?? null);

  function set<K extends keyof OrdenCompraForm>(k: K, val: OrdenCompraForm[K]) {
    setV(prev => ({ ...prev, [k]: val }));
  }

  // Cambiar de proveedor suelta la persona de contacto (era de otro) y trae
  // sus condiciones de pago si todavía no se escribieron unas.
  function elegirProveedor(id: string | null) {
    const p = proveedores.find(x => x.id === id);
    setV(prev => ({
      ...prev,
      proveedor_id: id,
      contacto_id: id === prev.proveedor_id ? prev.contacto_id : null,
      condiciones_pago: prev.condiciones_pago?.trim() ? prev.condiciones_pago : (p?.condiciones_pago ?? ""),
    }));
  }

  // Entrega esperada desde hoy (no se espera algo en el pasado); la cotización
  // hasta hoy (ya la mandó el proveedor). Hoy a las 00:00 local.
  const hoy = deFecha(aFecha(new Date()));

  const totales = calcularTotales(v.lineas ?? [], v.descuento, v.otros_costos, v.costos);

  return (
    <PanelCatalogo
      titulo={inicial ? "Editar orden de compra" : "Nueva orden de compra"}
      guardando={guardando}
      puedeGuardar={(v.lineas?.length ?? 0) > 0}
      error={error}
      textoGuardar={inicial ? "Guardar" : "Crear orden"}
      onCancel={onCancel}
      onSubmit={() => onSubmit(v)}
    >
      {/* Un campo por fila, como "Nueva OT": primero a quién se le compra,
          después el qué y al final los montos. */}
      <FieldRow icon={<Truck size={16} />} label="Proveedor">
        <SearchSelect
          placeholder="Elegir proveedor…"
          value={v.proveedor_id ?? ""}
          options={proveedores}
          onChange={(id: string) => elegirProveedor(id || null)}
          emptyLabel="Sin proveedor"
        />
      </FieldRow>

      {v.proveedor_id && (
        <FieldRow icon={<UserRound size={16} />} label="Atención (persona de contacto)">
          {contactos.length > 0 ? (
            <SearchSelect
              placeholder="Elegir persona…"
              value={v.contacto_id ?? ""}
              options={contactos.map(c => ({ id: c.id!, label: c.nombre, sub: [c.cargo, c.email].filter(Boolean).join(" · ") || undefined }))}
              onChange={(id: string) => set("contacto_id", id || null)}
              emptyLabel="Sin persona de contacto"
            />
          ) : (
            <span style={{ fontSize: 14, color: "var(--fg-4)" }}>
              Este proveedor no tiene personas de contacto. Se agregan en Proveedores.
            </span>
          )}
        </FieldRow>
      )}

      <FieldRow icon={<DollarSign size={16} />} label="Condiciones de pago">
        <input
          value={v.condiciones_pago ?? ""}
          onChange={e => set("condiciones_pago", e.target.value)}
          placeholder="30 días"
          style={inputStyle}
          {...focoInput}
        />
      </FieldRow>

      <FieldRow icon={<Hash size={16} />} label="N° de orden (opcional)">
        {/* Si la empresa arrastra su propia nomenclatura, manda sobre el
            correlativo interno al imprimir el documento. */}
        <input
          value={v.numero_manual ?? ""}
          onChange={e => set("numero_manual", e.target.value)}
          placeholder="OC-2026-014"
          style={inputStyle}
          {...focoInput}
        />
      </FieldRow>

      <FieldRow icon={<CalendarDays size={16} />} label="Entrega esperada">
        <DatePicker
          value={v.fecha_entrega_esperada ? deFecha(v.fecha_entrega_esperada) : undefined}
          onChange={d => set("fecha_entrega_esperada", d ? aFecha(d) : "")}
          placeholder="Seleccionar fecha"
          min={hoy}
        />
      </FieldRow>

      <FieldRow icon={<MapPin size={16} />} label="Dirección de despacho">
        <input
          value={v.direccion_despacho ?? ""}
          onChange={e => set("direccion_despacho", e.target.value)}
          placeholder="Ingresa la dirección..."
          style={inputStyle}
          {...focoInput}
        />
      </FieldRow>

      {/* Respaldo de los precios: una OC declara "precios acordados". Opcional
          porque una compra chica no pasa por cotizacion formal. */}
      <FieldRow icon={<FileText size={16} />} label="N° de cotización (opcional)">
        <input
          value={v.cotizacion_numero ?? ""}
          onChange={e => set("cotizacion_numero", e.target.value)}
          placeholder="COT-4482"
          style={inputStyle}
          {...focoInput}
        />
      </FieldRow>
      <FieldRow icon={<CalendarDays size={16} />} label="Fecha de cotización">
        <DatePicker
          value={v.cotizacion_fecha ? deFecha(v.cotizacion_fecha) : undefined}
          onChange={d => set("cotizacion_fecha", d ? aFecha(d) : "")}
          placeholder="Seleccionar fecha"
          max={hoy}
        />
      </FieldRow>

      <FieldRow icon={<Package size={16} />} label="Materiales">
        <LineasPicker
          wsId={wsId}
          proveedorId={v.proveedor_id ?? null}
          value={v.lineas ?? []}
          onChange={l => set("lineas", l)}
        />
      </FieldRow>

      <FieldRow icon={<Percent size={16} />} label="Descuento global">
        <input
          type="number" min={0} step="any"
          value={v.descuento ?? 0}
          onChange={e => set("descuento", Math.max(Number(e.target.value) || 0, 0))}
          style={inputStyle}
          {...focoInput}
        />
      </FieldRow>

      {/* Costos con nombre propio. El IVA NO está acá: se calcula solo, 19%,
          y no es editable — escribirlo a mano es como se descuadra un
          documento. */}
      <FieldRow icon={<Tag size={16} />} label="Otros costos (flete, despacho…)">
        <CostosPicker
          value={v.costos ?? []}
          onChange={c => set("costos", c)}
        />
      </FieldRow>

      {/* Se muestra el desglose mientras se edita para que nadie descubra el
          total recién al imprimir. */}
      <div style={{
        display: "flex", flexDirection: "column", gap: 4, marginBottom: 20,
        padding: 12, background: "var(--surface-hover)", borderRadius: "var(--r-md)",
      }}>
        <Fila label="Neto" valor={totales.neto} />
        {totales.neto_exento > 0 && <Fila label="Neto exento" valor={totales.neto_exento} />}
        <Fila label="IVA 19%" valor={totales.iva} />
        <Fila label="Total" valor={totales.total} fuerte />
      </div>

      <FieldRow icon={<FileText size={16} />} label="Observaciones">
        <textarea
          value={v.observaciones ?? ""}
          onChange={e => set("observaciones", e.target.value)}
          rows={3}
          style={textareaStyle}
          {...focoInput}
        />
      </FieldRow>
    </PanelCatalogo>
  );
}

function Fila({ label, valor, fuerte }: { label: string; valor: number; fuerte?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
      <span style={{ color: fuerte ? "var(--fg-1)" : "var(--fg-3)" }}>{label}</span>
      <span style={{ color: "var(--fg-1)" }}>{formatearCLP(valor)}</span>
    </div>
  );
}
