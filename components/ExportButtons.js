"use client";
import { useState } from "react";
import { exportarPDF, exportarExcel } from "@/lib/exportar-mantto";
import styles from "@/components/ExportButtons.module.css";

export default function ExportButtons({ ordenes, filtros }) {
  const [exportando, setExportando] = useState(null);

  async function handlePDF() {
    setExportando("pdf");
    try {
      await exportarPDF(ordenes, filtros);
    } catch (e) {
      console.error("Error exportando PDF:", e);
      alert("Error al generar PDF. Intenta de nuevo.");
    }
    setExportando(null);
  }

  async function handleExcel() {
    setExportando("xlsx");
    try {
      await exportarExcel(ordenes, filtros);
    } catch (e) {
      console.error("Error exportando Excel:", e);
      alert("Error al generar Excel. Intenta de nuevo.");
    }
    setExportando(null);
  }

  if (!ordenes || ordenes.length === 0) return null;

  return (
    <div className={styles.container}>
      <button className={styles.btnPdf} onClick={handlePDF} disabled={!!exportando}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
        {exportando === "pdf" ? "Generando..." : "Exportar PDF"}
      </button>
      <button className={styles.btnXlsx} onClick={handleExcel} disabled={!!exportando}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M2 6h12M6 2v12" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        {exportando === "xlsx" ? "Generando..." : "Exportar Excel"}
      </button>
    </div>
  );
}
