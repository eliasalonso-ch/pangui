"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScanResult, Prioridad, Usuario } from "@/types/ordenes";

interface ScanSheetProps {
  open: boolean;
  scanResult: ScanResult | null;
  capturaPhoto: File | null;
  usuarios: Usuario[];
  creating: boolean;
  success: boolean;
  dupError: boolean;
  onClose: () => void;
  onConfirm: (data: {
    titulo: string;
    numero_meconecta: string;
    solicitante: string;
    prioridad: Prioridad;
    asignadosIds: string[];
    ubicacion: string;
    lugar: string;
    descripcion: string;
  }) => void;
}

const PRIO_BTNS: { value: Prioridad; label: string; color: string }[] = [
  { value: "baja",    label: "Baja",    color: "#9CA3AF" },
  { value: "media",   label: "Media",   color: "#3B82F6" },
  { value: "alta",    label: "Alta",    color: "#F97316" },
  { value: "urgente", label: "Urgente", color: "#EF4444" },
];

function initials(nombre: string) {
  return nombre.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function ConfIcon({ low }: { low: boolean }) {
  if (low) return <AlertTriangle size={15} className="text-amber-500 shrink-0" />;
  return <CheckCircle2 size={15} className="text-green-500 shrink-0" />;
}

export default function ScanSheet({
  open,
  scanResult,
  capturaPhoto,
  usuarios,
  creating,
  success,
  dupError,
  onClose,
  onConfirm,
}: ScanSheetProps) {
  const [titulo,       setTitulo]       = useState(scanResult?.titulo ?? "");
  const [numero,       setNumero]       = useState(scanResult?.numero_meconecta ?? "");
  const [ubicacion,    setUbicacion]    = useState(scanResult?.ubicacion ?? "");
  const [lugar,        setLugar]        = useState(scanResult?.lugar ?? "");
  const [descripcion,  setDescripcion]  = useState(scanResult?.descripcion ?? "");
  const [solicitante,  setSolicitante]  = useState(scanResult?.solicitante ?? "");
  const [prioridad,    setPrioridad]    = useState<Prioridad>(scanResult?.prioridad ?? "media");
  const [asignadosIds, setAsignadosIds] = useState<string[]>([]);
  const [photoUrl,     setPhotoUrl]     = useState<string | null>(null);

  // Reset form when a new scan result arrives
  useEffect(() => {
    if (!scanResult) return;
    setTitulo(scanResult.titulo ?? "");
    setNumero(scanResult.numero_meconecta ?? "");
    setUbicacion(scanResult.ubicacion ?? "");
    setLugar(scanResult.lugar ?? "");
    setDescripcion(scanResult.descripcion ?? "");
    setSolicitante(scanResult.solicitante ?? "");
    setPrioridad(scanResult.prioridad ?? "media");
    setAsignadosIds([]);
  }, [scanResult]);

  useEffect(() => {
    if (!capturaPhoto) return;
    const url = URL.createObjectURL(capturaPhoto);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [capturaPhoto]);

  const isLow = (field: string) =>
    (scanResult as unknown as Record<string, unknown>)?.[`${field}_conf`] === "low" ||
    (scanResult as unknown as Record<string, unknown>)?.[field] == null;

  const toggleAsignado = (uid: string) =>
    setAsignadosIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="h-[92dvh] flex flex-col p-0 rounded-none">
        {success ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4">
            <CheckCircle2 size={48} className="text-green-500" />
            <p className="text-lg font-semibold">Orden creada</p>
            <p className="text-sm text-muted-foreground">Lista para asignar ✔</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
              <span className="font-semibold text-base">Orden escaneada</span>
              <button
                className="p-1 text-muted-foreground hover:text-foreground"
                onClick={onClose}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {photoUrl && (
                <img
                  src={photoUrl}
                  alt="Orden escaneada"
                  className="w-full max-h-40 object-cover rounded-none border border-border"
                />
              )}

              {/* N° Referencia */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">N° Referencia</label>
                <div className="relative flex items-center">
                  <input
                    className={cn(
                      "w-full h-9 px-3 pr-8 text-sm border bg-background outline-none focus:ring-1 focus:ring-primary",
                      isLow("numero_meconecta") ? "border-amber-400" : "border-green-400"
                    )}
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    placeholder="Nº de referencia"
                  />
                  <span className="absolute right-2.5">
                    <ConfIcon low={isLow("numero_meconecta")} />
                  </span>
                </div>
                {dupError && (
                  <p className="text-xs text-red-500">⚠ Este número ya existe en el sistema</p>
                )}
              </div>

              {/* Título */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Título <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    className={cn(
                      "w-full h-9 px-3 pr-8 text-sm border bg-background outline-none focus:ring-1 focus:ring-primary",
                      isLow("titulo") ? "border-amber-400" : "border-green-400"
                    )}
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="¿Qué hay que hacer?"
                  />
                  <span className="absolute right-2.5">
                    <ConfIcon low={isLow("titulo")} />
                  </span>
                </div>
              </div>

              {/* Ubicación */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Ubicación (edificio)</label>
                <div className="relative flex items-center">
                  <input
                    className={cn(
                      "w-full h-9 px-3 pr-8 text-sm border bg-background outline-none focus:ring-1 focus:ring-primary",
                      isLow("ubicacion") ? "border-amber-400" : "border-green-400"
                    )}
                    value={ubicacion}
                    onChange={(e) => setUbicacion(e.target.value)}
                    placeholder="Ej: Aulas Centrales"
                  />
                  <span className="absolute right-2.5">
                    <ConfIcon low={isLow("ubicacion")} />
                  </span>
                </div>
              </div>

              {/* Lugar */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Lugar (sector específico)</label>
                <div className="relative flex items-center">
                  <input
                    className={cn(
                      "w-full h-9 px-3 pr-8 text-sm border bg-background outline-none focus:ring-1 focus:ring-primary",
                      isLow("lugar") ? "border-amber-400" : "border-green-400"
                    )}
                    value={lugar}
                    onChange={(e) => setLugar(e.target.value)}
                    placeholder="Ej: Pasos cubiertos aula 9"
                  />
                  <span className="absolute right-2.5">
                    <ConfIcon low={isLow("lugar")} />
                  </span>
                </div>
              </div>

              {/* Descripción */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Detalle / Descripción</label>
                <textarea
                  className="w-full px-3 py-2 text-sm border border-border bg-background outline-none focus:ring-1 focus:ring-primary resize-none"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Detalle de lo que hay que hacer…"
                  rows={3}
                />
              </div>

              {/* Solicitante */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Solicitante</label>
                <div className="relative flex items-center">
                  <input
                    className={cn(
                      "w-full h-9 px-3 pr-8 text-sm border bg-background outline-none focus:ring-1 focus:ring-primary",
                      isLow("solicitante") ? "border-amber-400" : "border-green-400"
                    )}
                    value={solicitante}
                    onChange={(e) => setSolicitante(e.target.value)}
                    placeholder="Nombre del solicitante"
                  />
                  <span className="absolute right-2.5">
                    <ConfIcon low={isLow("solicitante")} />
                  </span>
                </div>
              </div>

              {/* Prioridad */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Prioridad</label>
                <div className="flex gap-2 flex-wrap">
                  {PRIO_BTNS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      className="px-3 py-1.5 text-sm border font-medium transition-colors"
                      style={
                        prioridad === p.value
                          ? { borderColor: p.color, color: p.color, background: `${p.color}18` }
                          : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                      }
                      onClick={() => setPrioridad(p.value)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Asignar a */}
              {usuarios.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Asignar a</label>
                  <div className="flex flex-wrap gap-2">
                    {usuarios.map((u) => {
                      const active = asignadosIds.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 text-sm border transition-colors",
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-foreground hover:bg-muted"
                          )}
                          onClick={() => toggleAsignado(u.id)}
                        >
                          <span
                            className={cn(
                              "w-5 h-5 flex items-center justify-center text-[10px] font-bold shrink-0",
                              active ? "bg-primary-foreground/20" : "bg-muted"
                            )}
                          >
                            {initials(u.nombre)}
                          </span>
                          {u.nombre.split(" ")[0]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-border p-4">
              <Button
                className="w-full h-11 rounded-none font-semibold gap-2"
                disabled={creating || !titulo.trim()}
                onClick={() =>
                  onConfirm({ titulo, numero_meconecta: numero, solicitante, prioridad, asignadosIds, ubicacion, lugar, descripcion })
                }
              >
                {creating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Creando…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Confirmar y crear
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
