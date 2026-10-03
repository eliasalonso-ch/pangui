"use client";

/**
 * Panel de conexión MeConecta (columna derecha de /integraciones/meconecta).
 *
 * La clave va del formulario directo a Vault (RPC set_meconecta_credentials) y
 * nunca vuelve: después solo se muestra el usuario. "Probar" pide al servidor
 * un login + lectura y refresca el estado guardado.
 */

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import {
  getConexionMeconecta, guardarCredencialesMeconecta, desconectarMeconecta, probarMeconecta,
  estadoVisible, type ConexionMeconecta,
} from "@/lib/meconecta-conexion";
import { EstadoBadge } from "@/components/integraciones/Logos";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

const btn = (primario: boolean): CSSProperties => ({
  height: 38, width: "100%", borderRadius: "var(--r-md)", fontSize: 14, fontWeight: 500, cursor: "pointer",
  border: primario ? "none" : "1px solid var(--border-strong)",
  background: primario ? "var(--brand)" : "var(--surface-1)",
  color: primario ? "var(--brand-fg)" : "var(--fg-1)",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
});

function fechaHora(iso: string | null): string {
  if (!iso) return "Todavía no";
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
}

export default function ConexionMeconectaPanel() {
  const [conexion, setConexion] = useState<ConexionMeconecta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [probando, setProbando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [dialogo, setDialogo] = useState(false);
  const [confirmarBaja, setConfirmarBaja] = useState(false);

  const cargar = useCallback(async () => {
    try { setConexion(await getConexionMeconecta()); }
    catch { setAviso({ ok: false, texto: "No se pudo cargar el estado de la conexión" }); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function probar() {
    setProbando(true);
    setAviso(null);
    const r = await probarMeconecta();
    setAviso(r.ok ? { ok: true, texto: "Conexión verificada" } : { ok: false, texto: r.error ?? "La prueba falló" });
    await cargar();
    setProbando(false);
  }

  async function desconectar() {
    try {
      await desconectarMeconecta();
      setAviso({ ok: true, texto: "MeConecta desconectado. La clave se borró." });
      await cargar();
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo desconectar" });
    }
  }

  const estado = estadoVisible(conexion);

  return (
    <div style={{ padding: 20, border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "var(--fg-1)" }}>Conexión</p>
        {!cargando && <EstadoBadge estado={estado} />}
      </div>

      {cargando ? (
        <div style={{ display: "grid", placeItems: "center", minHeight: 80, color: "var(--fg-3)" }}><Loader2 size={18} className="animate-spin" /></div>
      ) : conexion ? (
        <dl style={{ margin: 0, display: "grid", gap: 10, fontSize: 14 }}>
          <div><dt style={{ color: "var(--fg-3)" }}>Conectado como</dt><dd style={{ margin: 0, color: "var(--fg-1)", wordBreak: "break-all" }}>{conexion.username}</dd></div>
          <div><dt style={{ color: "var(--fg-3)" }}>Última sincronización</dt><dd style={{ margin: 0, color: "var(--fg-1)" }}>{fechaHora(conexion.last_sync_at)}</dd></div>
          {conexion.status !== "conectado" && conexion.last_error && (
            <div><dt style={{ color: "var(--fg-3)" }}>Último error</dt><dd style={{ margin: 0, color: "var(--danger)" }}>{conexion.last_error}</dd></div>
          )}
        </dl>
      ) : (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--fg-2)" }}>
          Conecta la cuenta MeConecta de tu empresa para recibir aviso de cada solicitud nueva.
        </p>
      )}

      {aviso && (
        <p role="status" style={{ margin: 0, fontSize: 13, color: aviso.ok ? "var(--success)" : "var(--danger)" }}>{aviso.texto}</p>
      )}

      {!cargando && (
        <div style={{ display: "grid", gap: 8 }}>
          {conexion ? (
            <>
              <button type="button" style={btn(true)} onClick={probar} disabled={probando}>
                {probando && <Loader2 size={15} className="animate-spin" />} Probar conexión
              </button>
              <button type="button" style={btn(false)} onClick={() => setDialogo(true)}>Cambiar clave</button>
              <button type="button" onClick={() => setConfirmarBaja(true)} style={{ ...btn(false), border: "none", background: "transparent", color: "var(--danger)" }}>
                Desconectar
              </button>
            </>
          ) : (
            <button type="button" style={btn(true)} onClick={() => setDialogo(true)}>Conectar</button>
          )}
        </div>
      )}

      <CredencialesDialog
        abierto={dialogo}
        usuarioInicial={conexion?.username ?? ""}
        onCerrar={() => setDialogo(false)}
        onGuardado={async (r) => {
          setAviso(r.ok ? { ok: true, texto: "Conectado. Pangui ya puede revisar MeConecta." } : { ok: false, texto: r.error ?? "La prueba falló" });
          await cargar();
        }}
      />

      <AlertDialog open={confirmarBaja} onOpenChange={setConfirmarBaja}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desconectar MeConecta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra la clave guardada y Pangui deja de revisar el portal. Puedes volver a conectarlo cuando quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={desconectar}>Desconectar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CredencialesDialog({ abierto, usuarioInicial, onCerrar, onGuardado }: {
  abierto: boolean;
  usuarioInicial: string;
  onCerrar: () => void;
  onGuardado: (r: { ok: boolean; error?: string }) => Promise<void>;
}) {
  const [usuario, setUsuario] = useState(usuarioInicial);
  const [clave, setClave] = useState("");
  const [autoriza, setAutoriza] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada apertura parte limpia: la clave nunca queda en memoria entre intentos.
  useEffect(() => {
    if (abierto) { setUsuario(usuarioInicial); setClave(""); setAutoriza(false); setError(null); }
  }, [abierto, usuarioInicial]);

  const listo = autoriza && usuario.trim() !== "" && clave !== "";

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await guardarCredencialesMeconecta(usuario.trim(), clave, autoriza);
      setClave("");
      const r = await probarMeconecta();
      await onGuardado(r);
      if (r.ok) onCerrar();
      else setError(r.error ?? "MeConecta no aceptó la conexión");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <DialogContent>
        <form onSubmit={enviar} style={{ display: "grid", gap: 14 }}>
          <DialogHeader>
            <DialogTitle>Conectar MeConecta</DialogTitle>
            <DialogDescription>
              Usa la cuenta de tu empresa en meconecta.udec.cl. La clave se guarda cifrada y no se vuelve a mostrar.
            </DialogDescription>
          </DialogHeader>
          <label style={{ display: "grid", gap: 6, fontSize: 14, color: "var(--fg-2)" }}>
            Usuario (correo)
            <Input type="email" autoComplete="off" required value={usuario} onChange={(e) => setUsuario(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 14, color: "var(--fg-2)" }}>
            Clave
            <Input type="password" autoComplete="new-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, lineHeight: 1.45, color: "var(--fg-1)" }}>
            <input type="checkbox" checked={autoriza} onChange={(e) => setAutoriza(e.target.checked)} style={{ marginTop: 3 }} />
            Autorizo a Pangui a sincronizar mis solicitudes de MeConecta.
          </label>
          {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>{error}</p>}
          <DialogFooter>
            <button type="submit" disabled={guardando || !listo} style={{ ...btn(true), width: "auto", padding: "0 18px", opacity: guardando || !listo ? 0.5 : 1 }}>
              {guardando && <Loader2 size={15} className="animate-spin" />} Guardar y probar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
