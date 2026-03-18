"use client";

export async function exportarPDF(ordenes, filtros = {}) {
  const jsPDFModule = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDFModule.jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  const accent1   = [216, 90, 48];
  const accent2   = [250, 236, 231];
  const negro     = [0, 0, 0];
  const gris      = [111, 111, 111];
  const blanco    = [255, 255, 255];
  const grisClaro = [233, 233, 233];

  const fechaHoy = new Date().toLocaleDateString("es-CL", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const desde = filtros.desde || "—";
  const hasta  = filtros.hasta  || "—";

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const total       = ordenes.length;
  const completadas = ordenes.filter((o) => o.estado === "completado").length;
  const enCurso     = ordenes.filter((o) => o.estado === "en_curso").length;
  const pendientes  = ordenes.filter((o) => o.estado === "pendiente").length;
  const emergencias = ordenes.filter((o) => o.tipo === "emergencia").length;
  const conDuracion = ordenes.filter((o) => o.duracion_min > 0);
  const duracionProm =
    conDuracion.length > 0
      ? Math.round(
          conDuracion.reduce((s, o) => s + (o.duracion_min || 0), 0) /
            conDuracion.length,
        )
      : 0;

  // ── Aggregate materials across all orders ─────────────────────────────────
  const matMap = {};
  ordenes.forEach((o) => {
    (o.materiales_usados || []).forEach((m) => {
      if (!m.nombre) return;
      const key = m.nombre.trim().toLowerCase();
      if (!matMap[key]) {
        matMap[key] = { nombre: m.nombre.trim(), cantidad: 0, ordenes: new Set() };
      }
      matMap[key].cantidad += Number(m.cantidad) || 0;
      matMap[key].ordenes.add(o.id);
    });
  });
  const matAgg = Object.values(matMap)
    .sort((a, b) => b.cantidad - a.cantidad)
    .map((m) => ({ ...m, nOrdenes: m.ordenes.size }));

  // ── Helper: page header ───────────────────────────────────────────────────
  function drawHeader(subtitulo) {
    doc.setFillColor(...negro);
    doc.rect(0, 0, w, 18, "F");
    doc.setTextColor(...blanco);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Pangi", 10, 12);
    const pangiW = doc.getTextWidth("Pangi");
    doc.setTextColor(...blanco);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(subtitulo, 10 + pangiW + 6, 12);
    doc.text(fechaHoy, w - 10, 12, { align: "right" });
  }

  // ── PÁGINA 1 – KPIs + barras técnico ──────────────────────────────────────
  drawHeader("Reporte de mantenimiento");

  doc.setTextColor(...negro);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Reporte de órdenes de trabajo", 10, 32);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...gris);
  doc.text(`Período: ${desde} al ${hasta}  ·  ${total} órdenes analizadas`, 10, 39);
  if (filtros.tecnico) doc.text(`Técnico: ${filtros.tecnico}`, 10, 45);
  if (filtros.tipo)
    doc.text(`Tipo: ${filtros.tipo}`, filtros.tecnico ? 80 : 10, 45);

  // KPI boxes
  const kpiY = 52;
  const kpiW = 42;
  const kpiH = 26;
  const kpiGap = 5;

  function drawKPI(x, y, label, value, highlight = false) {
    doc.setFillColor(...(highlight ? accent1 : accent2));
    doc.roundedRect(x, y, kpiW, kpiH, 3, 3, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...(highlight ? blanco : gris));
    doc.text(label, x + 5, y + 8);
    doc.setFontSize(17);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(highlight ? blanco : negro));
    doc.text(String(value), x + 5, y + 21);
  }

  let kpiX = 10;
  drawKPI(kpiX, kpiY, "TOTAL ÓRDENES", total, true); kpiX += kpiW + kpiGap;
  drawKPI(kpiX, kpiY, "COMPLETADAS",   completadas); kpiX += kpiW + kpiGap;
  drawKPI(kpiX, kpiY, "EN CURSO",      enCurso);     kpiX += kpiW + kpiGap;
  drawKPI(kpiX, kpiY, "PENDIENTES",    pendientes);  kpiX += kpiW + kpiGap;
  drawKPI(kpiX, kpiY, "EMERGENCIAS",   emergencias); kpiX += kpiW + kpiGap;
  drawKPI(kpiX, kpiY, "DURACIÓN PROM.", duracionProm + " min");

  // Barras por técnico
  const chartY = kpiY + kpiH + 12;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...negro);
  doc.text("Trabajos por técnico", 10, chartY);

  const porTecnico = {};
  ordenes.forEach((o) => {
    const nombre = o.tecnicos?.nombre || o.tecnico?.nombre || o.tecnico_id || "Sin asignar";
    porTecnico[nombre] = (porTecnico[nombre] || 0) + 1;
  });

  const entries   = Object.entries(porTecnico).sort((a, b) => b[1] - a[1]);
  const maxCount  = entries.length > 0 ? entries[0][1] : 1;
  const barMaxW   = 130;
  const barH      = 6;
  const barGap    = 3.5;
  const barY      = chartY + 6;

  entries.forEach(([nombre, count], idx) => {
    const y = barY + idx * (barH + barGap);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...gris);
    const label = nombre.length > 20 ? nombre.slice(0, 18) + "…" : nombre;
    doc.text(label, 10, y + 5);
    doc.setFillColor(...grisClaro);
    doc.roundedRect(55, y, barMaxW, barH, 1.5, 1.5, "F");
    doc.setFillColor(...accent1);
    doc.roundedRect(55, y, (count / maxCount) * barMaxW, barH, 1.5, 1.5, "F");
    doc.setTextColor(...negro);
    doc.setFont("helvetica", "bold");
    doc.text(String(count), 55 + barMaxW + 5, y + 5);
  });

  // ── PÁGINA 2 – Tabla detalle órdenes ──────────────────────────────────────
  doc.addPage("landscape");
  drawHeader("Detalle de órdenes");

  const tableData = ordenes.map((o) => {
    const fecha = o.created_at
      ? new Date(o.created_at).toLocaleDateString("es-CL", {
          day: "2-digit", month: "2-digit", year: "2-digit",
        })
      : "—";
    const hora = o.hora_inicio
      ? new Date(o.hora_inicio).toLocaleTimeString("es-CL", {
          hour: "2-digit", minute: "2-digit",
        })
      : "—";
    const tipo     = o.tipo === "emergencia" ? "Emergencia" : "Solicitud";
    const tecnico  = o.tecnicos?.nombre || o.tecnico?.nombre || o.tecnico_id || "—";
    const ubicacion = o.ubicaciones
      ? [o.ubicaciones.edificio, o.ubicaciones.detalle].filter(Boolean).join(" · ")
      : "—";
    const matsStr = Array.isArray(o.materiales_usados)
      ? o.materiales_usados
          .map((m) => m.nombre ? `${m.nombre} ${m.cantidad || ""} ${m.unidad || ""}`.trim() : null)
          .filter(Boolean)
          .join(", ") || "—"
      : "—";
    const duracion = o.duracion_min != null ? o.duracion_min + " min" : "—";
    const estado   = {
      completado: "Completado", en_curso: "En curso",
      pendiente: "Pendiente",   cancelado: "Cancelado",
    }[o.estado] || o.estado || "—";
    const firmado  = o.nombre_solicitante || (o.firma_solicitante ? "Sí" : "—");
    const cobro = { no_cobrable: "No cobrable", pendiente_cobro: "Pendiente cobro", cobrado: "Cobrado" }[o.estado_cobro] || "—";
    return [fecha, hora, tipo, tecnico, ubicacion, o.descripcion || "—", matsStr, duracion, estado, firmado,
      cobro, o.numero_factura || "—", o.costo_materiales ?? 0, o.costo_mano_obra ?? 0, o.costo_total ?? 0];
  });

  autoTable(doc, {
    startY: 24,
    head: [["Fecha", "Hora", "Tipo", "Técnico", "Ubicación", "Descripción", "Materiales", "Duración", "Estado", "Firmado por", "Cobro", "N° Factura", "Mat. ($)", "M. Obra ($)", "Total ($)"]],
    body: tableData,
    styles: { fontSize: 7, cellPadding: 2, font: "helvetica", overflow: "linebreak" },
    headStyles: { fillColor: negro, textColor: blanco, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 13 }, 1: { cellWidth: 10 }, 2: { cellWidth: 15 },
      3: { cellWidth: 20 }, 4: { cellWidth: 22 }, 5: { cellWidth: 36 },
      6: { cellWidth: 28 }, 7: { cellWidth: 12 }, 8: { cellWidth: 16 },
      9: { cellWidth: 18 }, 10: { cellWidth: 18 }, 11: { cellWidth: 18 },
      12: { cellWidth: 14 }, 13: { cellWidth: 14 }, 14: { cellWidth: 14 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2 && data.cell.raw === "Emergencia") {
        data.cell.styles.textColor = [229, 62, 62];
        data.cell.styles.fontStyle = "bold";
      }
      if (data.section === "body" && data.column.index === 8) {
        const v = data.cell.raw;
        if (v === "Completado")  data.cell.styles.textColor = [39, 103, 73];
        else if (v === "En curso")  data.cell.styles.textColor = [43, 108, 176];
        else if (v === "Cancelado") data.cell.styles.textColor = [111, 111, 111];
      }
    },
    margin: { left: 5, right: 5 },
  });

  // ── PÁGINA 3 – Materiales utilizados ──────────────────────────────────────
  if (matAgg.length > 0) {
    doc.addPage("landscape");
    drawHeader("Materiales utilizados");

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...negro);
    doc.text("Materiales utilizados en el período", 10, 30);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...gris);
    doc.text(`${matAgg.length} materiales distintos registrados en ${total} órdenes`, 10, 37);

    // Mini bar chart: top 10 by cantidad
    const top10 = matAgg.slice(0, 10);
    const maxCant = top10[0]?.cantidad || 1;
    const chartStartY = 44;
    const rowH2 = 8;

    top10.forEach((m, idx) => {
      const y = chartStartY + idx * rowH2;
      const label = m.nombre.length > 30 ? m.nombre.slice(0, 28) + "…" : m.nombre;

      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...gris);
      doc.text(label, 10, y + 5.5);

      doc.setFillColor(...grisClaro);
      doc.roundedRect(105, y + 1, 110, 5, 1.5, 1.5, "F");
      doc.setFillColor(...accent1);
      doc.roundedRect(105, y + 1, (m.cantidad / maxCant) * 110, 5, 1.5, 1.5, "F");

      doc.setFont("helvetica", "bold");
      doc.setTextColor(...negro);
      doc.text(String(m.cantidad), 219, y + 5.5);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(...gris);
      doc.text(`${m.nOrdenes} ód.`, 235, y + 5.5);
    });

    // Full table below chart
    const tableStartY = chartStartY + top10.length * rowH2 + 14;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...negro);
    doc.text("Detalle completo", 10, tableStartY - 4);

    autoTable(doc, {
      startY: tableStartY,
      head: [["Material", "Cantidad total usada", "N° órdenes"]],
      body: matAgg.map((m) => [m.nombre, m.cantidad, m.nOrdenes]),
      styles: { fontSize: 8, cellPadding: 3, font: "helvetica" },
      headStyles: {
        fillColor: negro, textColor: blanco,
        fontStyle: "bold", fontSize: 8,
      },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 46, halign: "center" },
        2: { cellWidth: 36, halign: "center" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = accent1;
        }
      },
      margin: { left: 10, right: 10 },
    });
  }

  // ── Página de firmas ───────────────────────────────────────────────────────
  const ordenesConFirma = ordenes.filter((o) => o.firma_solicitante && o.nombre_solicitante);

  if (ordenesConFirma.length > 0) {
    doc.addPage("landscape");
    drawHeader("Firmas de conformidad");

    const firmaW = 130;
    const firmaH = 38;
    const rowH   = firmaH + 30;
    let firmaY   = 26;

    ordenesConFirma.forEach((o) => {
      if (firmaY + rowH > h - 12) {
        doc.addPage("landscape");
        firmaY = 26;
        drawHeader("Firmas de conformidad");
      }

      const year   = new Date(o.created_at).getFullYear();
      const suffix = o.id.slice(-4).toUpperCase();
      const oid    = `${o.tipo === "emergencia" ? "EM" : "OT"}-${year}-${suffix}`;

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...negro);
      doc.text(oid, 10, firmaY + 6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...gris);
      doc.text(o.nombre_solicitante, 10, firmaY + 12);

      if (o.firmado_at) {
        doc.text(
          new Date(o.firmado_at).toLocaleString("es-CL", {
            day: "2-digit", month: "2-digit", year: "2-digit",
            hour: "2-digit", minute: "2-digit",
          }),
          10, firmaY + 18,
        );
      }

      try {
        doc.addImage(o.firma_solicitante, "PNG", 10, firmaY + 22, firmaW, firmaH);
      } catch (_) {
        doc.setTextColor(...gris);
        doc.text("[firma no disponible]", 10, firmaY + 40);
      }
      firmaY += rowH;
    });
  }

  // ── Pie de página en todas las páginas ────────────────────────────────────
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...gris);
    doc.text(`Pangi · Reporte de mantenimiento · ${fechaHoy}`, 10, h - 5);
    doc.text(`Página ${i} de ${pages}`, w - 10, h - 5, { align: "right" });
  }

  doc.save(`pangi_reporte_${desde}_${hasta}.pdf`);
}

export async function exportarExcel(ordenes, filtros = {}) {
  const XLSX = await import("xlsx-js-style");

  const desde = filtros.desde || "export";
  const hasta  = filtros.hasta  || "";

  // ── Hoja 1: Órdenes de trabajo ────────────────────────────────────────────
  const datosOrdenes = ordenes.map((o) => {
    const matsStr = Array.isArray(o.materiales_usados)
      ? o.materiales_usados
          .map((m) => m.nombre ? `${m.nombre} ${m.cantidad || ""} ${m.unidad || ""}`.trim() : null)
          .filter(Boolean)
          .join(", ")
      : "";

    return {
      Fecha: o.created_at
        ? new Date(o.created_at).toLocaleDateString("es-CL") : "—",
      Hora_inicio: o.hora_inicio
        ? new Date(o.hora_inicio).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "—",
      Hora_termino: o.hora_termino
        ? new Date(o.hora_termino).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "—",
      Tipo:      o.tipo === "emergencia" ? "Emergencia" : "Solicitud",
      Técnico:   o.tecnicos?.nombre || o.tecnico?.nombre || o.tecnico_id || "—",
      Ubicación: o.ubicaciones?.detalle || "—",
      Edificio:  o.ubicaciones?.edificio || "—",
      Descripción: o.descripcion || "—",
      Materiales: matsStr || "—",
      Duración_min: o.duracion_min ?? "—",
      Estado: {
        completado: "Completado", en_curso: "En curso",
        pendiente: "Pendiente",   cancelado: "Cancelado",
      }[o.estado] || o.estado || "—",
      N_MeConecta: o.numero_meconecta || "—",
      Observación: o.observacion     || "—",
      Firmado_por: o.nombre_solicitante || "—",
      Firmado_at: o.firmado_at
        ? new Date(o.firmado_at).toLocaleString("es-CL", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          })
        : "—",
      Estado_cobro: { no_cobrable: "No cobrable", pendiente_cobro: "Pendiente cobro", cobrado: "Cobrado" }[o.estado_cobro] || "—",
      N_Factura:        o.numero_factura || "—",
      Fecha_cobro:      o.fecha_cobro ? new Date(o.fecha_cobro).toLocaleDateString("es-CL") : "—",
      Costo_materiales: o.costo_materiales ?? 0,
      Costo_mano_obra:  o.costo_mano_obra  ?? 0,
      Costo_total:      o.costo_total       ?? 0,
    };
  });

  const wsOrdenes = XLSX.utils.json_to_sheet(datosOrdenes);
  wsOrdenes["!cols"] = [
    { wch: 12 }, { wch: 11 }, { wch: 12 }, { wch: 12 }, { wch: 22 },
    { wch: 24 }, { wch: 18 }, { wch: 36 }, { wch: 30 }, { wch: 13 },
    { wch: 13 }, { wch: 16 }, { wch: 30 }, { wch: 24 }, { wch: 18 },
    { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
  ];

  // ── Hoja 2: Materiales (una fila por material × orden) ────────────────────
  const datosMateriales = [];
  ordenes.forEach((o) => {
    if (!Array.isArray(o.materiales_usados) || o.materiales_usados.length === 0) return;
    const fecha   = o.created_at
      ? new Date(o.created_at).toLocaleDateString("es-CL") : "—";
    const year    = new Date(o.created_at || Date.now()).getFullYear();
    const suffix  = o.id.slice(-4).toUpperCase();
    const ordenId = `${o.tipo === "emergencia" ? "EM" : "OT"}-${year}-${suffix}`;
    const tecnico = o.tecnicos?.nombre || o.tecnico?.nombre || o.tecnico_id || "—";

    o.materiales_usados.forEach((m) => {
      if (!m.nombre) return;
      datosMateriales.push({
        Fecha:    fecha,
        Orden:    ordenId,
        Técnico:  tecnico,
        Material: m.nombre.trim(),
        Código:   m.codigo || "—",
        Cantidad: Number(m.cantidad) || 0,
        Unidad:   m.unidad || "un",
      });
    });
  });

  const wsMateriales = XLSX.utils.json_to_sheet(
    datosMateriales.length > 0
      ? datosMateriales
      : [{ Fecha: "—", Orden: "—", Técnico: "—", Material: "—", Código: "—", Cantidad: 0, Unidad: "—" }]
  );
  wsMateriales["!cols"] = [
    { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 34 },
    { wch: 12 }, { wch: 10 }, { wch: 8  },
  ];

  // Apply header style to both sheets
  function styleHeader(ws, nCols) {
    const headerStyle = {
      font:    { bold: true, color: { rgb: "FFFFFF" } },
      fill:    { fgColor: { rgb: "000000" } },
      alignment: { horizontal: "center" },
    };
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let c = 0; c <= Math.min(nCols - 1, range.e.c); c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = headerStyle;
    }
  }

  styleHeader(wsOrdenes,     15);
  styleHeader(wsMateriales,  7);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsOrdenes,    "Órdenes de trabajo");
  XLSX.utils.book_append_sheet(wb, wsMateriales, "Materiales");

  XLSX.writeFile(wb, `pangi_reporte_${desde}_${hasta}.xlsx`);
}
