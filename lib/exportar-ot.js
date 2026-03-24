"use client";

// Colors
const BLUE   = [39, 61, 136];
const NEGRO  = [26, 26, 26];
const GRIS   = [107, 114, 128];
const BLANCO = [255, 255, 255];
const BORDE  = [226, 230, 240];
const VERDE  = [34, 197, 94];
const ROJO   = [239, 68, 68];
const AMBAR  = [245, 158, 11];
const INDIGO = [99, 102, 241];

function estadoColor(estado) {
  switch (estado) {
    case "completado":   return VERDE;
    case "cancelado":    return ROJO;
    case "en_revision":  return INDIGO;
    case "en_curso":     return AMBAR;
    default:             return GRIS;
  }
}

function estadoLabel(estado) {
  const map = {
    pendiente:   "Abierta",
    en_espera:   "En espera",
    en_curso:    "En curso",
    en_revision: "En revisión",
    completado:  "Completada",
    cancelado:   "Cancelada",
  };
  return map[estado] ?? estado;
}

const PRIORIDAD_LABEL = {
  ninguna: "Sin prioridad",
  baja:    "Baja",
  media:   "Media",
  alta:    "Alta",
  urgente: "Urgente",
};

function formatId(orden) {
  const year = new Date(orden.created_at).getFullYear();
  const suffix = orden.id.slice(-4).toUpperCase();
  return `${orden.tipo === "emergencia" ? "EM" : "OT"}-${year}-${suffix}`;
}

function fmt(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-CL", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("es-CL", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function duracionFmt(min) {
  if (!min) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Draw a pill badge
function drawBadge(doc, text, color, x, y) {
  const pad = 5;
  doc.setFontSize(8);
  const w = doc.getTextWidth(text) + pad * 2;
  doc.setFillColor(...color);
  doc.roundedRect(x, y - 4, w, 7, 1.5, 1.5, "F");
  doc.setTextColor(...BLANCO);
  doc.setFont("helvetica", "bold");
  doc.text(text, x + pad, y + 0.5);
  doc.setTextColor(...NEGRO);
  doc.setFont("helvetica", "normal");
  return w;
}

// Draw page header (logo area + title bar)
function drawHeader(doc, pageW, orden, planta) {
  // Blue top bar
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, pageW, 22, "F");

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BLANCO);
  doc.text("PANGUI", 14, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Gestión de Órdenes de Trabajo", 14, 17);

  // OT ID top-right
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(formatId(orden), pageW - 14, 10, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(planta ?? "", pageW - 14, 16, { align: "right" });
  doc.setTextColor(...NEGRO);
}

// Draw page footer
function drawFooter(doc, pageW, pageH, pageNum, totalPages) {
  doc.setFontSize(7);
  doc.setTextColor(...GRIS);
  doc.setDrawColor(...BORDE);
  doc.line(14, pageH - 10, pageW - 14, pageH - 10);
  doc.text(
    `Pangui · Orden de Trabajo · Generado ${new Date().toLocaleDateString("es-CL")}`,
    14, pageH - 5,
  );
  doc.text(`Página ${pageNum} de ${totalPages}`, pageW - 14, pageH - 5, { align: "right" });
  doc.setTextColor(...NEGRO);
}

// Section label + horizontal rule
function sectionTitle(doc, text, y, pageW) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...BLUE);
  doc.text(text.toUpperCase(), 14, y);
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.3);
  doc.line(14, y + 1.5, pageW - 14, y + 1.5);
  doc.setTextColor(...NEGRO);
  doc.setFont("helvetica", "normal");
  doc.setLineWidth(0.1);
  return y + 7;
}

// Key-value pair in two columns
function kv(doc, label, value, x, y, labelW = 38) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...NEGRO);
  doc.text(String(value ?? "—"), x + labelW, y);
}

export async function exportarOTPDF(orden, materiales, fotos, planta) {
  const { jsPDF } = await import("jspdf");
  const autoTable  = (await import("jspdf-autotable")).default;

  const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();   // 210
  const pageH = doc.internal.pageSize.getHeight();  // 297

  const id = formatId(orden);

  // ── Page 1: Details ──────────────────────────────────────────
  drawHeader(doc, pageW, orden, planta);

  let y = 30;

  // Status badge row
  drawBadge(doc, estadoLabel(orden.estado), estadoColor(orden.estado), 14, y);
  if (orden.tipo === "emergencia") drawBadge(doc, "EMERGENCIA", ROJO, 60, y);
  y += 10;

  // ── General Info ──
  y = sectionTitle(doc, "Información General", y, pageW);

  const col1x = 14, col2x = 110;
  kv(doc, "Nº Orden",      id,                                      col1x, y);
  kv(doc, "Estado",        estadoLabel(orden.estado),               col2x, y);
  y += 6;
  kv(doc, "Tipo",          orden.tipo === "emergencia" ? "Emergencia" : "Solicitud", col1x, y);
  kv(doc, "Prioridad",     PRIORIDAD_LABEL[orden.prioridad] ?? orden.prioridad ?? "—", col2x, y);
  y += 6;
  kv(doc, "Nº MeConecta",  orden.numero_meconecta ?? "—",           col1x, y);
  kv(doc, "Creado",        fmt(orden.created_at),                   col2x, y);
  y += 6;

  const ubic = orden.ubicaciones
    ? `${orden.ubicaciones.edificio}${orden.ubicaciones.piso ? `, piso ${orden.ubicaciones.piso}` : ""}${orden.ubicaciones.detalle ? ` · ${orden.ubicaciones.detalle}` : ""}`
    : "—";
  kv(doc, "Ubicación",     ubic,                                    col1x, y);
  kv(doc, "Técnico",       orden.tecnicos?.nombre ?? "Sin asignar", col2x, y);
  y += 6;
  kv(doc, "Inicio",        fmt(orden.hora_inicio),                  col1x, y);
  kv(doc, "Término",       fmt(orden.hora_termino),                 col2x, y);
  y += 6;
  kv(doc, "Duración",      duracionFmt(orden.duracion_min),         col1x, y);
  y += 10;

  // ── Description ──
  y = sectionTitle(doc, "Descripción", y, pageW);
  doc.setFontSize(9);
  const descLines = doc.splitTextToSize(orden.descripcion ?? "—", pageW - 28);
  doc.text(descLines, 14, y);
  y += descLines.length * 5 + 4;

  if (orden.observacion) {
    y = sectionTitle(doc, "Observaciones del Técnico", y, pageW);
    doc.setFontSize(9);
    const obsLines = doc.splitTextToSize(orden.observacion, pageW - 28);
    doc.text(obsLines, 14, y);
    y += obsLines.length * 5 + 4;
  }

  if (orden.rechazo_motivo) {
    y = sectionTitle(doc, "Motivo de Rechazo", y, pageW);
    doc.setFillColor(254, 242, 242);
    doc.roundedRect(14, y - 2, pageW - 28, 12, 2, 2, "F");
    doc.setTextColor(...ROJO);
    doc.setFontSize(9);
    const rejLines = doc.splitTextToSize(orden.rechazo_motivo, pageW - 32);
    doc.text(rejLines, 16, y + 3);
    doc.setTextColor(...NEGRO);
    y += 16;
  }

  // ── Client / Billing info ──
  if (orden.nombre_cliente) {
    y = sectionTitle(doc, "Cliente", y, pageW);
    kv(doc, "Nombre",   orden.nombre_cliente ?? "—",  col1x, y);
    kv(doc, "RUT",      orden.rut_cliente ?? "—",     col2x, y);
    y += 6;
    kv(doc, "Giro",     orden.giro_cliente ?? "—",    col1x, y);
    kv(doc, "IVA",      orden.aplica_iva ? "Sí (19%)" : "No", col2x, y);
    y += 6;
    if (orden.direccion_cliente) {
      kv(doc, "Dirección", orden.direccion_cliente,   col1x, y);
      y += 6;
    }
    y += 4;
  }

  // ── Materials table ──
  if (materiales && materiales.length > 0) {
    y = sectionTitle(doc, "Materiales Utilizados", y, pageW);

    const costoTotal = materiales.reduce((s, m) => {
      return s + (Number(m.cantidad) || 0) * (Number(m.precio_unitario) || 0);
    }, 0);

    autoTable(doc, {
      startY: y,
      head: [["Material", "Cant.", "Unidad", "P. Unit.", "Total"]],
      body: materiales.map((m) => [
        m.nombre,
        m.cantidad,
        m.unidad ?? "un",
        m.precio_unitario ? `$${Number(m.precio_unitario).toLocaleString("es-CL")}` : "—",
        m.precio_unitario
          ? `$${(Number(m.cantidad) * Number(m.precio_unitario)).toLocaleString("es-CL")}`
          : "—",
      ]),
      foot: costoTotal > 0 ? [["", "", "", "Total materiales", `$${costoTotal.toLocaleString("es-CL")}`]] : [],
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: BLUE, textColor: BLANCO, fontStyle: "bold" },
      footStyles: { fillColor: BORDE, textColor: NEGRO, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 16, halign: "right" },
        2: { cellWidth: 18 },
        3: { cellWidth: 24, halign: "right" },
        4: { cellWidth: 24, halign: "right" },
      },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── Billing summary ──
  if (orden.estado_cobro && orden.estado_cobro !== "no_cobrable") {
    if (y > pageH - 50) { doc.addPage(); y = 30; }
    y = sectionTitle(doc, "Facturación", y, pageW);
    kv(doc, "Estado cobro", orden.estado_cobro === "cobrado" ? "Cobrado" : "Pendiente", col1x, y);
    if (orden.numero_factura) kv(doc, "N° Factura", orden.numero_factura, col2x, y);
    y += 6;
    if (orden.costo_materiales) kv(doc, "Costo materiales", `$${Number(orden.costo_materiales).toLocaleString("es-CL")}`, col1x, y);
    if (orden.costo_mano_obra)  kv(doc, "Mano de obra",     `$${Number(orden.costo_mano_obra).toLocaleString("es-CL")}`,  col2x, y);
    y += 6;
    if (orden.costo_total) {
      doc.setFont("helvetica", "bold");
      kv(doc, "Total", `$${Number(orden.costo_total).toLocaleString("es-CL")}`, col1x, y);
      doc.setFont("helvetica", "normal");
      y += 6;
    }
    y += 4;
  }

  // ── Page 2: Photos + Signature ────────────────────────────────
  const fotosAntes   = (fotos ?? []).filter((f) => f.tipo === "antes");
  const fotosDespues = (fotos ?? []).filter((f) => f.tipo === "despues");
  const hasPhotos    = fotosAntes.length > 0 || fotosDespues.length > 0;
  const hasSignature = !!orden.firma_solicitante;

  if (hasPhotos || hasSignature) {
    doc.addPage();
    drawHeader(doc, pageW, orden, planta);
    y = 30;

    // Photos
    async function drawFotos(label, lista, startY) {
      if (lista.length === 0) return startY;
      let cy = sectionTitle(doc, label, startY, pageW);

      const imgW = (pageW - 28 - 4) / 2;  // 2 columns
      const imgH = 55;
      let col = 0;

      for (const foto of lista.slice(0, 6)) {
        try {
          const resp = await fetch(foto.url);
          const blob = await resp.blob();
          const dataUrl = await new Promise((res) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result);
            reader.readAsDataURL(blob);
          });
          const x = 14 + col * (imgW + 4);
          doc.addImage(dataUrl, "JPEG", x, cy, imgW, imgH, undefined, "FAST");
          if (col === 1) { cy += imgH + 3; }
          col = (col + 1) % 2;
        } catch {
          // skip photo on error
        }
      }
      if (col === 1) cy += imgH + 3;
      return cy + 6;
    }

    y = await drawFotos("Fotos Antes", fotosAntes, y);
    if (y > pageH - 80 && fotosDespues.length > 0) {
      doc.addPage();
      drawHeader(doc, pageW, orden, planta);
      y = 30;
    }
    y = await drawFotos("Fotos Después", fotosDespues, y);

    // Signature
    if (hasSignature) {
      if (y > pageH - 70) {
        doc.addPage();
        drawHeader(doc, pageW, orden, planta);
        y = 30;
      }
      y = sectionTitle(doc, "Firma del Solicitante", y, pageW);
      try {
        doc.addImage(orden.firma_solicitante, "PNG", 14, y, 80, 35);
      } catch {}
      y += 38;
      kv(doc, "Nombre", orden.nombre_solicitante ?? "—", 14, y);
      y += 6;
      kv(doc, "Firmado", fmt(orden.firmado_at), 14, y);
      y += 10;

      // Legal footer
      doc.setFontSize(7);
      doc.setTextColor(...GRIS);
      const legal =
        "La firma digital registrada en este documento certifica la recepción conforme de los trabajos " +
        "realizados, conforme a la Ley 21.719 de Protección de Datos Personales. Los datos del firmante " +
        "(nombre y firma) son tratados exclusivamente para acreditar la prestación del servicio.";
      const legalLines = doc.splitTextToSize(legal, pageW - 28);
      doc.text(legalLines, 14, y);
      doc.setTextColor(...NEGRO);
    }
  }

  // ── Footers on all pages ──────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, pageW, pageH, p, totalPages);
  }

  doc.save(`${id}.pdf`);
}
