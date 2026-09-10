"use client";

import { useState, useEffect } from "react";
import {
  Truck, Hash, CalendarDays, DollarSign, FileText, MapPin, Package, Percent, Tag,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import {
  PanelCatalogo, FieldRow, inputStyle, textareaStyle, focoInput,
} from "@/components/catalogo/PanelCatalogo";
import SearchSelect from "@/components/catalogo/SearchSelect";
import { formatearCLP } from "@/lib/tributario";
import { calcularTotales } from "@/lib/ordenes-compra-api";
import LineasPicker from "./LineasPicker";
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
  const [proveedores, setProveedores] = useState<{ id: string; label: string; sub?: string }[]>([]);
  const [v, setV] = useState<OrdenCompraForm>({
    proveedor_id: inicial?.proveedor_id ?? null,
    numero_manual: inicial?.numero_manual ?? "",
    fecha_emision: inicial?.fecha_emision ?? new Date().toISOString().slice(0, 10),
    fecha_entrega_esperada: inicial?.fecha_entrega_esperada ?? "",
    direccion_despacho: inicial?.direccion_despacho ?? "",
    condiciones_pago: inicial?.condiciones_pago ?? "",
    descuento: inicial?.descuento ?? 0,
    otros_costos: inicial?.otros_costos ?? 0,
    observaciones: inicial?.observaciones ?? "",
    cotizacion_numero: inicial?.cotizacion_numero ?? "",
    cotizacion_fecha: inicial?.cotizacion_fecha ?? "",
    lineas: lineasIniciales ?? [],
  });

  useEffect(() => {
    if (!wsId) return;
    let active = true;
    createClient()
      .from("proveedores")
      .select("id, nombre, rut, condiciones_pago")
      .eq("workspace_id", wsId).eq("activo", true).order("nombre")
      .then(({ data }) => {
        if (!active) return;
        setProveedores((data ?? []).map((p: any) => ({
          id: p.id, label: p.nombre, sub: p.rut ?? undefined,
        })));
      });
    return () => { active = false; };
  }, [wsId]);

  function set<K extends keyof OrdenCompraForm>(k: K, val: OrdenCompraForm[K]) {
    setV(prev => ({ ...prev, [k]: val }));
  }

  const totales = calcularTotales(v.lineas ?? [], v.descuento, v.otros_costos);

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
      <FieldRow icon={<Truck size={16} />} label="Proveedor">
        <SearchSelect
          placeholder="Elegir proveedor…"
          value={v.proveedor_id ?? ""}
          options={proveedores}
          onChange={(id: string) => set("proveedor_id", id || null)}
          emptyLabel="Sin proveedor"
        />
      </FieldRow>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
          <input
            type="date"
            value={v.fecha_entrega_esperada ?? ""}
            onChange={e => set("fecha_entrega_esperada", e.target.value)}
            style={inputStyle}
            {...focoInput}
          />
        </FieldRow>
      </div>

      <FieldRow icon={<DollarSign size={16} />} label="Condiciones de pago">
        <input
          value={v.condiciones_pago ?? ""}
          onChange={e => set("condiciones_pago", e.target.value)}
          placeholder="30 días"
          style={inputStyle}
          {...focoInput}
        />
      </FieldRow>

      {/* Respaldo de los precios: una OC declara "precios acordados". Opcional
          porque una compra chica no pasa por cotizacion formal. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
          <input
            type="date"
            value={v.cotizacion_fecha ?? ""}
            onChange={e => set("cotizacion_fecha", e.target.value)}
            style={inputStyle}
            {...focoInput}
          />
        </FieldRow>
      </div>

      <FieldRow icon={<MapPin size={16} />} label="Dirección de despacho">
        <input
          value={v.direccion_despacho ?? ""}
          onChange={e => set("direccion_despacho", e.target.value)}
          style={inputStyle}
          {...focoInput}
        />
      </FieldRow>

      <FieldRow icon={<Package size={16} />} label="Ítems">
        <LineasPicker
          wsId={wsId}
          value={v.lineas ?? []}
          onChange={l => set("lineas", l)}
        />
      </FieldRow>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FieldRow icon={<Percent size={16} />} label="Descuento global">
          <input
            type="number" min={0} step="any"
            value={v.descuento ?? 0}
            onChange={e => set("descuento", Math.max(Number(e.target.value) || 0, 0))}
            style={inputStyle}
            {...focoInput}
          />
        </FieldRow>
        <FieldRow icon={<Tag size={16} />} label="Otros costos (flete, etc.)">
          <input
            type="number" min={0} step="any"
            value={v.otros_costos ?? 0}
            onChange={e => set("otros_costos", Math.max(Number(e.target.value) || 0, 0))}
            style={inputStyle}
            {...focoInput}
          />
        </FieldRow>
      </div>

      {/* Se muestra el desglose mientras se edita para que nadie descubra el
          total recién al imprimir. */}
      <div style={{
        display: "flex", flexDirection: "column", gap: 4, marginBottom: 20,
        padding: 12, background: "var(--surface-hover)", borderRadius: "var(--r-md)",
      }}>
        <Fila label="Neto" valor={totales.neto} />
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
