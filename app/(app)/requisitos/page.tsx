"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { esAdmin } from "@/lib/roles";
import {
  Loader2, Camera, Zap, Box, FileSpreadsheet, Lock, HelpCircle,
  ChevronLeft, Building2, User, Briefcase,
} from "lucide-react";

type WorkspaceTipo = "subcontratista" | "propietario" | "hibrido";
type ModoRegistro = "ambos" | "materiales" | "hoja";

const MODO_OPTIONS: { value: ModoRegistro; label: string; description: string }[] = [
  { value: "ambos",      label: "Ambos",                  description: "Materiales y hoja de cálculo están disponibles en las OTs." },
  { value: "materiales", label: "Solo materiales",        description: "La hoja de cálculo queda desactivada en todas las OTs." },
  { value: "hoja",       label: "Solo hoja de cálculo",   description: "El módulo de materiales queda desactivado en todas las OTs." },
];

interface WorkspaceReqs {
  requiere_materiales_global: boolean;
  requiere_hoja_global: boolean;
  requiere_fotos_global: boolean;
  fotos_obligatorias_todas: boolean;
  crear_ot_solo_admins: boolean;
  pedir_clasificacion: boolean;
}

const DEFAULTS: WorkspaceReqs = {
  requiere_materiales_global: false,
  requiere_hoja_global: false,
  requiere_fotos_global: false,
  fotos_obligatorias_todas: false,
  crear_ot_solo_admins: false,
  pedir_clasificacion: false,
};

const TIPO_OPTIONS: { value: WorkspaceTipo; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: "subcontratista",
    label: "Subcontratista",
    description: "Mantengo activos de clientes. Los reportes se entregan con el logo del cliente.",
    icon: <Briefcase size={16} />,
  },
  {
    value: "propietario",
    label: "Propietario",
    description: "Soy dueño de los activos que mantengo. Reportes internos con mi logo.",
    icon: <Building2 size={16} />,
  },
  {
    value: "hibrido",
    label: "Híbrido",
    description: "Ambos: tengo activos propios y también atiendo clientes externos.",
    icon: <User size={16} />,
  },
];

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ marginTop: 28, marginBottom: 10 }}>
      <p style={{
        fontSize: 12, fontWeight: 700, color: "var(--fg-2)",
        textTransform: "uppercase", letterSpacing: "0.06em", margin: 0,
      }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function RowSwitch({
  icon, label, sub, value, onChange, last, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
  disabled?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "14px 16px",
      borderBottom: last ? "none" : "1px solid var(--border)",
      opacity: disabled ? 0.55 : 1,
    }}>
      <span style={{
        width: 32, height: 32, borderRadius: 8,
        background: "var(--brand-tint)", color: "var(--brand-fg)",
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--fg-1)" }}>{label}</p>
        {sub && (
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--fg-4)", lineHeight: 1.45 }}>{sub}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        style={{
          width: 42, height: 24, borderRadius: 12, border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          background: value ? "var(--brand)" : "var(--border-strong)",
          position: "relative", transition: "background 0.2s", flexShrink: 0,
        }}
      >
        <span style={{
          position: "absolute", top: 2, left: value ? 20 : 2,
          width: 20, height: 20, borderRadius: "50%",
          background: "var(--surface-1)", transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </button>
    </div>
  );
}

const CARD: React.CSSProperties = {
  background: "var(--surface-1)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  overflow: "hidden",
  boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
};

const HELP_TEXT: React.CSSProperties = {
  fontSize: 12, color: "var(--fg-4)", margin: "8px 4px 0", lineHeight: 1.5,
};

export default function RequisitosPage() {
  const router = useRouter();
  const [rol, setRol] = useState<string>("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [reqs, setReqs] = useState<WorkspaceReqs>(DEFAULTS);
  const [tipo, setTipo] = useState<WorkspaceTipo>("subcontratista");
  const [modoRegistro, setModoRegistro] = useState<ModoRegistro>("ambos");
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const { data: perfil } = await sb
        .from("usuarios")
        .select("rol, workspace_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!perfil?.workspace_id) { setLoading(false); return; }
      setRol(perfil.rol ?? "");
      setWorkspaceId(perfil.workspace_id);

      const { data: ws } = await sb
        .from("workspaces")
        .select("requiere_materiales_global, requiere_hoja_global, requiere_fotos_global, fotos_obligatorias_todas, crear_ot_solo_admins, pedir_clasificacion, tipo, modo_registro")
        .eq("id", perfil.workspace_id)
        .maybeSingle();

      if (ws) {
        setReqs({
          requiere_materiales_global: ws.requiere_materiales_global ?? false,
          requiere_hoja_global:       ws.requiere_hoja_global ?? false,
          requiere_fotos_global:      ws.requiere_fotos_global ?? false,
          fotos_obligatorias_todas:   ws.fotos_obligatorias_todas ?? false,
          crear_ot_solo_admins:       ws.crear_ot_solo_admins ?? false,
          pedir_clasificacion:        ws.pedir_clasificacion ?? false,
        });
        const t = (ws as { tipo?: string }).tipo;
        if (t === "propietario" || t === "subcontratista" || t === "hibrido") setTipo(t);
        const m = (ws as { modo_registro?: string }).modo_registro;
        if (m === "ambos" || m === "materiales" || m === "hoja") setModoRegistro(m);
      }
      setLoading(false);
    }
    load();
  }, [router]);

  async function update<K extends keyof WorkspaceReqs>(key: K, value: WorkspaceReqs[K]) {
    if (!workspaceId) return;
    const previous = reqs[key];
    setReqs(prev => ({ ...prev, [key]: value }));
    setSavingKey(key);
    setErr(null);
    const sb = createClient();
    const { error } = await sb.from("workspaces").update({ [key]: value }).eq("id", workspaceId);
    setSavingKey(null);
    if (error) {
      setReqs(prev => ({ ...prev, [key]: previous }));
      setErr("No se pudo guardar el cambio.");
    }
  }

  async function updateTipo(next: WorkspaceTipo) {
    if (!workspaceId || next === tipo) return;
    const previous = tipo;
    setTipo(next);
    setSavingKey("tipo");
    setErr(null);
    const sb = createClient();
    const { error } = await sb.from("workspaces").update({ tipo: next }).eq("id", workspaceId);
    setSavingKey(null);
    if (error) {
      setTipo(previous);
      setErr("No se pudo guardar el cambio.");
    }
  }

  async function updateModoRegistro(next: ModoRegistro) {
    if (!workspaceId || next === modoRegistro) return;
    const previous = modoRegistro;
    setModoRegistro(next);
    setSavingKey("modo_registro");
    setErr(null);
    const sb = createClient();
    // If we just disabled a module, also clear its "Requerir por defecto"
    // toggle so new OTs don't try to enforce a disabled requirement.
    const patch: Record<string, unknown> = { modo_registro: next };
    if (next === "hoja" && reqs.requiere_materiales_global) patch.requiere_materiales_global = false;
    if (next === "materiales" && reqs.requiere_hoja_global) patch.requiere_hoja_global = false;
    const { error } = await sb.from("workspaces").update(patch).eq("id", workspaceId);
    setSavingKey(null);
    if (error) {
      setModoRegistro(previous);
      setErr("No se pudo guardar el cambio.");
      return;
    }
    if (patch.requiere_materiales_global === false) setReqs(p => ({ ...p, requiere_materiales_global: false }));
    if (patch.requiere_hoja_global === false)       setReqs(p => ({ ...p, requiere_hoja_global: false }));
  }

  if (loading) {
    return (
      <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-4)", gap: 8 }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>Cargando…</span>
      </div>
    );
  }

  if (!esAdmin(rol)) {
    return (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--fg-4)" }}>
        <Lock size={32} />
        <span style={{ fontSize: 14 }}>No tienes acceso a esta sección.</span>
      </div>
    );
  }

  return (
    <div style={{ height: "100dvh", overflowY: "auto", background: "var(--surface-0)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 64px" }}>
        {/* Header */}
        <button
          type="button"
          onClick={() => router.push("/configuracion")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 14,
            background: "transparent", border: "none", color: "var(--fg-3)",
            fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, fontFamily: "inherit",
          }}
        >
          <ChevronLeft size={14} /> Configuración
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--fg-1)" }}>
          Requisitos de OTs
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--fg-4)" }}>
          Configura los requisitos por defecto y las reglas globales del workspace.
        </p>

        {err && (
          <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--danger)", background: "var(--danger-bg, rgba(239,68,68,0.08))", color: "var(--danger)", fontSize: 13 }}>
            {err}
          </div>
        )}

        {/* Tipo de cuenta */}
        <SectionHeader title="Tipo de cuenta" />
        <div style={CARD}>
          {TIPO_OPTIONS.map((opt, idx) => {
            const selected = tipo === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateTipo(opt.value)}
                disabled={savingKey === "tipo"}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  width: "100%", textAlign: "left",
                  padding: "14px 16px",
                  background: selected ? "var(--brand-tint)" : "var(--surface-1)",
                  border: "none",
                  borderBottom: idx === TIPO_OPTIONS.length - 1 ? "none" : "1px solid var(--border)",
                  cursor: savingKey === "tipo" ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: selected ? "var(--brand)" : "var(--surface-0)",
                  color: selected ? "var(--fg-on-brand, white)" : "var(--fg-3)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  border: selected ? "none" : "1px solid var(--border)", flexShrink: 0,
                }}>
                  {opt.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: selected ? "var(--brand-fg)" : "var(--fg-1)" }}>
                    {opt.label}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--fg-4)", lineHeight: 1.5 }}>
                    {opt.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        <p style={HELP_TEXT}>
          Cambiar el tipo no migra datos. Solo modifica qué partes de la app se muestran. Los clientes (sociedades) quedan guardados aunque pases a modo propietario.
        </p>

        {/* Fotos */}
        <SectionHeader title="Fotos" />
        <div style={CARD}>
          <RowSwitch
            icon={<Camera size={16} />}
            label="Requerir fotos por defecto"
            sub={reqs.fotos_obligatorias_todas
              ? "Anulado por el requisito global de abajo"
              : "Las nuevas OTs se crean con fotos obligatorias activadas"}
            value={reqs.fotos_obligatorias_todas || reqs.requiere_fotos_global}
            onChange={v => update("requiere_fotos_global", v)}
            disabled={savingKey === "requiere_fotos_global" || reqs.fotos_obligatorias_todas}
          />
          <RowSwitch
            icon={<Zap size={16} />}
            label="Fotos obligatorias en todas las OTs"
            sub="Aplica a todas las OTs sin importar su configuración individual"
            value={reqs.fotos_obligatorias_todas}
            onChange={v => update("fotos_obligatorias_todas", v)}
            disabled={savingKey === "fotos_obligatorias_todas"}
            last
          />
        </div>
        <p style={HELP_TEXT}>
          “Por defecto” aplica solo a nuevas OTs. “Todas las OTs” es un requisito global que no puede desactivarse por OT individualmente.
        </p>

        {/* Módulos de registro */}
        <SectionHeader title="Módulos de registro" />
        <div style={CARD}>
          {MODO_OPTIONS.map((opt, idx) => {
            const selected = modoRegistro === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateModoRegistro(opt.value)}
                disabled={savingKey === "modo_registro"}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  width: "100%", textAlign: "left",
                  padding: "14px 16px",
                  background: selected ? "var(--brand-tint)" : "var(--surface-1)",
                  border: "none",
                  borderBottom: idx === MODO_OPTIONS.length - 1 ? "none" : "1px solid var(--border)",
                  cursor: savingKey === "modo_registro" ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                  border: `2px solid ${selected ? "var(--brand)" : "var(--border-strong)"}`,
                  background: selected ? "var(--brand)" : "var(--surface-1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {selected && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--surface-1)" }} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: selected ? "var(--brand-fg)" : "var(--fg-1)" }}>
                    {opt.label}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--fg-4)", lineHeight: 1.5 }}>
                    {opt.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        <p style={HELP_TEXT}>
          Define qué módulos están disponibles en cada OT. Si desactivas uno, el requisito por defecto correspondiente queda bloqueado.
        </p>

        {/* Otros requisitos por defecto */}
        <SectionHeader title="Otros requisitos por defecto" />
        <div style={CARD}>
          <RowSwitch
            icon={<Box size={16} />}
            label="Requiere materiales"
            sub={modoRegistro === "hoja"
              ? "Desactivado porque el workspace solo usa hoja de cálculo"
              : "Las nuevas OTs se crean con materiales obligatorios"}
            value={modoRegistro === "hoja" ? false : reqs.requiere_materiales_global}
            onChange={v => update("requiere_materiales_global", v)}
            disabled={savingKey === "requiere_materiales_global" || modoRegistro === "hoja"}
          />
          <RowSwitch
            icon={<FileSpreadsheet size={16} />}
            label="Requiere hoja de cálculo"
            sub={modoRegistro === "materiales"
              ? "Desactivado porque el workspace solo usa materiales"
              : "Las nuevas OTs se crean con hoja de cálculo obligatoria"}
            value={modoRegistro === "materiales" ? false : reqs.requiere_hoja_global}
            onChange={v => update("requiere_hoja_global", v)}
            disabled={savingKey === "requiere_hoja_global" || modoRegistro === "materiales"}
            last
          />
        </div>
        <p style={HELP_TEXT}>
          Los requisitos por defecto se aplican al crear nuevas órdenes de trabajo. Puedes modificarlos en cada OT desde su pantalla de edición.
        </p>

        {/* Permisos */}
        <SectionHeader title="Permisos" />
        <div style={CARD}>
          <RowSwitch
            icon={<Lock size={16} />}
            label="Crear OT solo admins y owners"
            sub="Oculta el botón de crear nueva OT a técnicos y supervisores"
            value={reqs.crear_ot_solo_admins}
            onChange={v => update("crear_ot_solo_admins", v)}
            disabled={savingKey === "crear_ot_solo_admins"}
          />
          <RowSwitch
            icon={<HelpCircle size={16} />}
            label="Pedir clasificación al abrir OT"
            sub="Muestra el prompt de levantamiento/ejecución a los miembros al abrir una OT sin clasificar"
            value={reqs.pedir_clasificacion}
            onChange={v => update("pedir_clasificacion", v)}
            disabled={savingKey === "pedir_clasificacion"}
            last
          />
        </div>
      </div>
    </div>
  );
}
