import { createClient } from "@/lib/supabase";
import { desglosarNeto } from "@/lib/tributario";
import type {
  OrdenCompra,
  OrdenCompraCosto,
  OrdenCompraForm,
  OrdenCompraLinea,
  OrdenCompraLineaForm,
  OrdenCompraListItem,
  OrdenCompraRecepcion,
} from "@/types/ordenes-compra";

const OC_SELECT = `
  id, workspace_id, numero, numero_manual, proveedor_id, estado, origen,
  plan_id, plan_ocurrencia_id, orden_trabajo_id,
  fecha_emision, fecha_entrega_esperada, direccion_despacho, condiciones_pago, moneda,
  neto, descuento, otros_costos, iva, total, costos,
  observaciones, adjuntos, cotizacion_numero, cotizacion_fecha, precios_confirmados,
  aprobada_at, aprobada_por, rechazada_motivo,
  enviada_at, enviada_por, enviada_a_email,
  creado_por, actualizado_por, created_at, updated_at,
  proveedor:proveedores!proveedor_id(id, nombre, rut, email, contacto, telefono),
  creador:usuarios!creado_por(id, nombre),
  actualizador:usuarios!actualizado_por(id, nombre)
`;

/** Filas por pagina en la lista. */
export const OC_PAGE_SIZE = 20;

/**
 * Totales del documento.
 *
 * El IVA se calcula UNA vez sobre el neto final, nunca sumando el IVA de cada
 * linea: desglosar linea por linea arrastra el error de redondeo tantas veces
 * como items haya y el total deja de cuadrar con la suma de sus partes (ver el
 * comentario de desglosarCobroSuscripcion en lib/tributario.ts, que es el mismo
 * problema).
 *
 * Y dentro de desglosarNeto el IVA es una RESTA contra el bruto redondeado, no
 * un segundo round(neto * 0.19). Un documento donde neto + iva != total es un
 * documento que el proveedor va a rebotar.
 */
export function calcularTotales(
  lineas: OrdenCompraLineaForm[],
  descuento = 0,
  otrosCostos = 0,
  costos: OrdenCompraCosto[] = [],
): {
  neto: number; descuento: number; otros_costos: number; iva: number; total: number;
  neto_exento: number;
} {
  // El subtotal de lineas es la base de los costos porcentuales: un flete "5%"
  // se lee contra la mercaderia, no contra si mismo ni contra el IVA.
  const brutoAfecto = lineas.reduce((acc, l) => acc + (l.exenta ? 0 : totalLinea(l)), 0);
  const brutoExento = lineas.reduce((acc, l) => acc + (l.exenta ? totalLinea(l) : 0), 0);
  const subtotal = brutoAfecto + brutoExento;

  // Cada fila se redondea al resolverse: el CLP no tiene decimales, y arrastrar
  // fracciones hasta el final descuadraria el documento impreso.
  const resueltos = (costos ?? []).map(c => ({
    afecto: c.afecto !== false,
    monto: c.tipo === "porcentaje"
      ? Math.round(subtotal * (Number(c.valor) || 0) / 100)
      : Math.round(Number(c.valor) || 0),
  }));

  const costosAfectos = resueltos.reduce((a, c) => a + (c.afecto ? c.monto : 0), 0);
  const costosExentos = resueltos.reduce((a, c) => a + (c.afecto ? 0 : c.monto), 0);

  // `otros_costos` sigue siendo el total resuelto: el PDF, el cron y las
  // lecturas viejas lo leen tal cual. Cuando hay filas, manda la suma de ellas.
  const otros = resueltos.length > 0
    ? costosAfectos + costosExentos
    : (Math.round(otrosCostos) || 0);

  const desc = Math.round(descuento) || 0;

  // El descuento global se aplica contra lo afecto. Un descuento mayor dejaria
  // el neto negativo y desglosarNeto lanza, asi que topa en 0.
  const netoAfecto = Math.max(
    brutoAfecto - desc + (resueltos.length > 0 ? costosAfectos : otros),
    0,
  );
  const netoExento = Math.max(brutoExento + costosExentos, 0);

  // El IVA se calcula UNA vez sobre el neto afecto, por RESTA contra el bruto
  // redondeado. Lo exento no entra a la base.
  const d = desglosarNeto(netoAfecto);

  return {
    neto: d.neto + netoExento,
    descuento: desc,
    otros_costos: otros,
    iva: d.iva,
    total: d.bruto + netoExento,
    neto_exento: netoExento,
  };
}

/**
 * Total de una linea, con su descuento aplicado.
 *
 * Nunca negativo: un descuento mayor al subtotal imprimiria "-$281" en el
 * documento que recibe el proveedor. Se topa en 0 y quien edita ve que el
 * descuento se comio la linea entera.
 */
export function totalLinea(l: OrdenCompraLineaForm): number {
  const bruto = (l.cantidad || 0) * (l.precio_unitario || 0);
  return Math.max(Math.round(bruto - (l.descuento || 0)), 0);
}

/**
 * Una pagina de ordenes de compra.
 *
 * El conteo de lineas viene de una segunda consulta agrupada y no de un embed:
 * traer las lineas completas para contarlas es el patron de egreso que ya costo
 * caro en /ordenes.
 */
export async function listOrdenesCompra(
  desde = 0,
  limite = OC_PAGE_SIZE,
): Promise<OrdenCompraListItem[]> {
  const sb = createClient();

  const { data, error } = await sb
    .from("ordenes_compra")
    .select(`
      id, numero, numero_manual, estado, origen, total,
      fecha_emision, fecha_entrega_esperada, created_at,
      proveedor_id,
      proveedores ( nombre )
    `)
    .order("created_at", { ascending: false })
    .range(desde, desde + limite - 1);
  if (error) throw error;

  const filas = (data ?? []) as any[];
  if (filas.length === 0) return [];

  // `parte_id` viaja en la misma consulta que ya se hacia para contar: el
  // filtro por material necesita saber que partes toca cada OC, y pedirlo aca
  // no agrega un viaje. Sigue siendo una segunda consulta agrupada y no un
  // embed, por la razon de arriba.
  const { data: lineas, error: lErr } = await sb
    .from("ordenes_compra_lineas")
    .select("orden_compra_id, parte_id")
    .in("orden_compra_id", filas.map(f => f.id));
  if (lErr) throw lErr;

  const conteo = new Map<string, number>();
  const partesPorOC = new Map<string, string[]>();
  for (const l of (lineas ?? []) as any[]) {
    conteo.set(l.orden_compra_id, (conteo.get(l.orden_compra_id) ?? 0) + 1);
    if (l.parte_id) {
      const previas = partesPorOC.get(l.orden_compra_id);
      if (previas) previas.push(l.parte_id);
      else partesPorOC.set(l.orden_compra_id, [l.parte_id]);
    }
  }

  return filas.map(f => ({
    id: f.id,
    numero: f.numero,
    numero_manual: f.numero_manual,
    estado: f.estado,
    origen: f.origen,
    total: Number(f.total),
    fecha_emision: f.fecha_emision,
    fecha_entrega_esperada: f.fecha_entrega_esperada,
    created_at: f.created_at,
    proveedor_id: f.proveedor_id ?? null,
    proveedor_nombre: f.proveedores?.nombre ?? null,
    lineas_count: conteo.get(f.id) ?? 0,
    parte_ids: partesPorOC.get(f.id) ?? [],
  }));
}

export async function getOrdenCompra(id: string): Promise<OrdenCompra | null> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_compra")
    .select(OC_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as OrdenCompra) ?? null;
}

export async function listLineas(ocId: string): Promise<OrdenCompraLinea[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_compra_lineas")
    .select("id, orden_compra_id, parte_id, descripcion, codigo, unidad, cantidad, precio_unitario, descuento, exenta, total, cantidad_recibida, orden, partes ( stock_actual )")
    .eq("orden_compra_id", ocId)
    .order("orden");
  if (error) throw error;

  return ((data ?? []) as any[]).map(l => ({
    id: l.id,
    orden_compra_id: l.orden_compra_id,
    parte_id: l.parte_id,
    descripcion: l.descripcion,
    codigo: l.codigo,
    unidad: l.unidad,
    cantidad: Number(l.cantidad),
    precio_unitario: Number(l.precio_unitario),
    descuento: Number(l.descuento),
    exenta: l.exenta ?? false,
    total: Number(l.total),
    cantidad_recibida: Number(l.cantidad_recibida),
    orden: l.orden,
    stock_actual: l.partes?.stock_actual != null ? Number(l.partes.stock_actual) : null,
  }));
}

/**
 * Reemplaza las lineas por la lista dada.
 *
 * Borrar y reinsertar en vez de calcular el diff, igual que setPlanMateriales:
 * son pocas filas y solo importa el estado final.
 *
 * OJO: esto pierde `cantidad_recibida`. Por eso las pantallas solo permiten
 * editar lineas mientras la OC esta en borrador o por aprobar — una vez que
 * empezo a llegar mercaderia, el documento se congela.
 */
export async function setLineasOC(ocId: string, lineas: OrdenCompraLineaForm[]): Promise<void> {
  const sb = createClient();

  const { error: delErr } = await sb
    .from("ordenes_compra_lineas")
    .delete()
    .eq("orden_compra_id", ocId);
  if (delErr) throw delErr;

  const filas = lineas
    .filter(l => l.descripcion?.trim() && l.cantidad > 0)
    .map((l, i) => ({
      orden_compra_id: ocId,
      parte_id: l.parte_id || null,
      descripcion: l.descripcion.trim(),
      codigo: l.codigo?.trim() || null,
      unidad: l.unidad || "un",
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario || 0,
      descuento: l.descuento || 0,
      exenta: l.exenta ?? false,
      total: totalLinea(l),
      orden: i + 1,
    }));
  if (filas.length === 0) return;

  const { error } = await sb.from("ordenes_compra_lineas").insert(filas);
  if (error) throw error;
}

export async function createOrdenCompra(form: OrdenCompraForm): Promise<OrdenCompra> {
  const sb = createClient();

  const { data: userRes } = await sb.auth.getUser();
  const uid = userRes?.user?.id ?? null;

  const { data: perfil, error: perfilErr } = await sb
    .from("usuarios")
    .select("workspace_id")
    .eq("id", uid ?? "")
    .maybeSingle();
  if (perfilErr) throw perfilErr;
  if (!perfil?.workspace_id) throw new Error("No se pudo determinar el espacio de trabajo.");

  const totales = calcularTotales(form.lineas ?? [], form.descuento, form.otros_costos, form.costos);
  // `neto_exento` es derivado y no tiene columna: se descarta antes de insertar.
  const { neto_exento: _exento, ...totalesFila } = totales;

  const { data, error } = await sb
    .from("ordenes_compra")
    .insert({
      workspace_id: perfil.workspace_id,
      proveedor_id: form.proveedor_id || null,
      numero_manual: form.numero_manual?.trim() || null,
      estado: "borrador",
      origen: "manual",
      fecha_emision: form.fecha_emision || new Date().toISOString().slice(0, 10),
      fecha_entrega_esperada: form.fecha_entrega_esperada || null,
      direccion_despacho: form.direccion_despacho?.trim() || null,
      condiciones_pago: form.condiciones_pago?.trim() || null,
      observaciones: form.observaciones?.trim() || null,
      cotizacion_numero: form.cotizacion_numero?.trim() || null,
      cotizacion_fecha: form.cotizacion_fecha || null,
      adjuntos: form.adjuntos ?? [],
      costos: form.costos ?? [],
      ...totalesFila,
      creado_por: uid,
    })
    .select(OC_SELECT)
    .single();
  if (error) throw error;

  const oc = data as unknown as OrdenCompra;
  if (form.lineas?.length) await setLineasOC(oc.id, form.lineas);

  return oc;
}

/**
 * Guarda cambios y recalcula los totales.
 *
 * Los totales se recalculan aca y no en la UI para que una OC guardada desde
 * cualquier pantalla cuadre igual.
 */
export async function updateOrdenCompra(
  id: string,
  patch: Partial<OrdenCompraForm>,
): Promise<void> {
  const sb = createClient();

  const { data: userRes } = await sb.auth.getUser();
  const uid = userRes?.user?.id ?? null;

  // `lineas` no es una columna: se guarda en su propia tabla.
  const { lineas, ...resto } = patch;
  const limpio: Record<string, unknown> = { ...resto };
  for (const k of ["numero_manual", "direccion_despacho", "condiciones_pago", "observaciones", "cotizacion_numero"]) {
    if (typeof limpio[k] === "string") limpio[k] = (limpio[k] as string).trim() || null;
  }
  for (const k of ["proveedor_id", "fecha_entrega_esperada", "cotizacion_fecha"]) {
    if (limpio[k] === "") limpio[k] = null;
  }

  if (lineas) {
    await setLineasOC(id, lineas);
    const { neto_exento: _exento, ...totales } =
      calcularTotales(lineas, patch.descuento, patch.otros_costos, patch.costos);
    Object.assign(limpio, totales);
  }

  limpio.actualizado_por = uid;

  const { error } = await sb.from("ordenes_compra").update(limpio).eq("id", id);
  if (error) throw error;
}

export async function deleteOrdenCompra(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("ordenes_compra").delete().eq("id", id);
  if (error) throw error;
}

// ── Transiciones de estado ───────────────────────────────────────────────────
// Cada una sella quien y cuando, porque una orden de compra es un documento que
// despues hay que poder auditar: "quien aprobo esto" no puede quedar implicito.

export async function aprobarOC(id: string): Promise<void> {
  const sb = createClient();
  const { data: userRes } = await sb.auth.getUser();
  const uid = userRes?.user?.id ?? null;

  const { error } = await sb
    .from("ordenes_compra")
    .update({ estado: "aprobada", aprobada_at: new Date().toISOString(), aprobada_por: uid })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Marca que alguien reviso los precios contra el proveedor.
 *
 * Es lo que separa "precios del catalogo" de "precios acordados", que es lo
 * que una orden de compra declara. Sin esto la UI avisa y no deja aprobar.
 */
export async function confirmarPrecios(id: string, cotizacion?: {
  numero?: string | null;
  fecha?: string | null;
}): Promise<void> {
  const sb = createClient();
  const { data: userRes } = await sb.auth.getUser();
  const { error } = await sb
    .from("ordenes_compra")
    .update({
      precios_confirmados: true,
      cotizacion_numero: cotizacion?.numero?.trim() || null,
      cotizacion_fecha: cotizacion?.fecha || null,
      actualizado_por: userRes?.user?.id ?? null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function rechazarOC(id: string, motivo: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("ordenes_compra")
    .update({ estado: "rechazada", rechazada_motivo: motivo.trim() || null })
    .eq("id", id);
  if (error) throw error;
}

export async function enviarAAprobacion(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("ordenes_compra")
    .update({ estado: "pendiente_aprobacion" })
    .eq("id", id);
  if (error) throw error;
}

export async function cancelarOC(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("ordenes_compra").update({ estado: "cancelada" }).eq("id", id);
  if (error) throw error;
}

/**
 * Registra la recepcion de mercaderia y mueve el stock.
 *
 * Se llama a receive_material_stock (que ya existia para la recepcion manual)
 * en vez de tocar partes.stock_actual directo: esa RPC serializa con FOR UPDATE
 * y deja rastro en material_stock_entries, que es el libro de entradas a bodega.
 *
 * Las lineas sin parte_id (un flete, un servicio) se marcan como recibidas pero
 * no mueven stock: no hay que mover.
 *
 * La recepcion es parcial mientras quede algo pendiente. MaintainX hace lo
 * mismo, y es lo que pasa en la realidad: el proveedor despacha por partes.
 */
export async function registrarRecepcion(
  ocId: string,
  recibido: { linea_id: string; cantidad: number }[],
  nota?: string | null,
): Promise<void> {
  const sb = createClient();

  // UNA llamada. Antes esto era un bucle en el navegador: N RPC de stock + N
  // updates de linea + 1 de estado, sin transaccion. Si se cortaba a la mitad
  // el stock quedaba sumado sin que la OC lo registrara, y reintentar lo sumaba
  // DE NUEVO. La RPC hace todo junto: o entra completo o no entra nada.
  const { error } = await sb.rpc("recibir_orden_compra", {
    p_oc_id: ocId,
    p_items: recibido.filter(r => r.cantidad > 0),
    p_nota: nota?.trim() || null,
  });
  if (error) throw error;
}

/** Entregas parciales registradas, la mas reciente primero. */
export async function listRecepciones(ocId: string): Promise<OrdenCompraRecepcion[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_compra_recepciones")
    .select("id, orden_compra_id, numero, nota, unidades, items, valor, recibido_por, created_at, receptor:usuarios!recibido_por(id, nombre)")
    .eq("orden_compra_id", ocId)
    .order("numero", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as any[]).map(r => ({
    ...r,
    unidades: Number(r.unidades),
    valor: Number(r.valor),
  }));
}

/**
 * Descarga el PDF de la orden de compra.
 *
 * El payload se arma aca y no en el componente porque son cuatro consultas
 * (OC, lineas, emisor, proveedor) que la pantalla no necesita para nada mas.
 *
 * El logo sale de `workspaces.logo_url`. Si el workspace no tiene uno, viaja
 * null y el documento queda sin logo: es la empresa del cliente la que firma
 * esta orden, no Pangui.
 */
export async function descargarPDF(ocId: string): Promise<void> {
  const sb = createClient();

  const oc = await getOrdenCompra(ocId);
  if (!oc) throw new Error("No se encontró la orden de compra.");

  const { data: userRes } = await sb.auth.getUser();
  const { data: perfil } = await sb
    .from("usuarios").select("nombre").eq("id", userRes?.user?.id ?? "").maybeSingle();
  const exportadoPor = perfil?.nombre ?? "Usuario";

  const [lineas, emisorRes, proveedorRes] = await Promise.all([
    listLineas(ocId),
    sb.from("workspaces")
      .select("nombre, razon_social, rut, giro, direccion, telefono, email_contacto, sitio_web, logo_url")
      .eq("id", oc.workspace_id).maybeSingle(),
    oc.proveedor_id
      ? sb.from("proveedores")
          .select("nombre, rut, giro, contacto, direccion, comuna, ciudad, telefono, email")
          .eq("id", oc.proveedor_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const emisor = emisorRes.data ?? null;

  const res = await fetch("/api/export-oc-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      oc, lineas, emisor,
      proveedor: proveedorRes.data ?? null,
      exportadoPor,
      logoUrl: emisor?.logo_url ?? null,
    }),
  });

  if (!res.ok) {
    const info = await res.json().catch(() => null);
    throw new Error(info?.error ?? "No se pudo generar el PDF.");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `OC-${oc.numero_manual || oc.numero || ocId.slice(-8)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Envía la orden al proveedor.
 *
 * El estado pasa a "enviada" en el servidor, y solo si Resend acepta el correo:
 * marcarla aquí dejaría órdenes "enviadas" que nunca salieron.
 */
export async function enviarAlProveedor(ocId: string): Promise<string> {
  const res = await fetch("/api/email-oc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ocId }),
  });
  const info = await res.json().catch(() => null);
  if (!res.ok) throw new Error(info?.error ?? "No se pudo enviar la orden.");
  return info?.to ?? "";
}
