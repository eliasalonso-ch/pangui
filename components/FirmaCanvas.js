"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./FirmaCanvas.module.css";

export default function FirmaCanvas({ onFirmar, disabled = false }) {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const hasFirmaRef = useRef(false);

  const [nombre, setNombre] = useState("");
  const [consentido, setConsentido] = useState(false);
  const [canConfirm, setCanConfirm] = useState(false);
  const [error, setError] = useState(null);

  // ── Canvas setup ──────────────────────────────────────────

  function setupCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  useEffect(() => {
    setupCanvas();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Touch events (passive: false requerido para preventDefault) ──

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function getPos(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function handleTouchStart(e) {
      e.preventDefault();
      if (disabled || !consentido) return;
      const t = e.touches[0];
      const pos = getPos(t.clientX, t.clientY);
      isDrawingRef.current = true;
      const ctx = canvas.getContext("2d");
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }

    function handleTouchMove(e) {
      e.preventDefault();
      if (!isDrawingRef.current || disabled || !consentido) return;
      const t = e.touches[0];
      const pos = getPos(t.clientX, t.clientY);
      const ctx = canvas.getContext("2d");
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      if (!hasFirmaRef.current) {
        hasFirmaRef.current = true;
        setCanConfirm(true);
      }
    }

    function handleTouchEnd(e) {
      e.preventDefault();
      isDrawingRef.current = false;
    }

    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };
  }, [disabled, consentido]);

  // ── Mouse events ──────────────────────────────────────────

  function handleMouseDown(e) {
    if (disabled || !consentido) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    isDrawingRef.current = true;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }

  function handleMouseMove(e) {
    if (!isDrawingRef.current || disabled || !consentido) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
    if (!hasFirmaRef.current) {
      hasFirmaRef.current = true;
      setCanConfirm(true);
    }
  }

  function handleMouseUp() {
    isDrawingRef.current = false;
  }

  // ── Actions ───────────────────────────────────────────────

  function limpiar() {
    hasFirmaRef.current = false;
    setCanConfirm(false);
    setError(null);
    setupCanvas();
    // Keep consentido — signer already agreed, no need to re-check after clearing
  }

  function confirmar() {
    if (!hasFirmaRef.current) {
      setError("Por favor, firme en el recuadro.");
      return;
    }
    if (!nombre.trim()) {
      setError("Ingrese el nombre del solicitante.");
      return;
    }
    setError(null);
    const base64 = canvasRef.current.toDataURL("image/png");
    onFirmar(base64, nombre.trim());
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Nombre del solicitante</label>
        <input
          className={styles.input}
          type="text"
          placeholder="Nombre completo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          disabled={disabled}
        />
      </div>

      <label className={styles.consentRow}>
        <input
          type="checkbox"
          className={styles.consentCheck}
          checked={consentido}
          onChange={(e) => setConsentido(e.target.checked)}
          disabled={disabled}
        />
        <span className={styles.consentText}>
          Al firmar, acepto que mis datos (nombre y firma) quedan registrados en Pangui para acreditar la recepción de los trabajos realizados, conforme a la <strong>Ley 21.719</strong>.
        </span>
      </label>

      <p className={`${styles.instruccion} ${!consentido ? styles.instruccionMuted : ""}`}>
        {consentido
          ? "Firme aquí para confirmar que el trabajo fue realizado"
          : "Acepte el consentimiento para habilitar la firma"}
      </p>

      <div className={`${styles.canvasWrap} ${!consentido ? styles.canvasLocked : ""}`}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.btnLimpiar}
          onClick={limpiar}
          disabled={disabled}
        >
          Limpiar
        </button>
        <button
          type="button"
          className={styles.btnConfirmar}
          onClick={confirmar}
          disabled={disabled || !canConfirm || !consentido}
        >
          {disabled ? "Guardando…" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}
