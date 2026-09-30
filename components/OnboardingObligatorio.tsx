"use client";

// Required setup for workspaces created by the minimal web signup (name, email,
// password). /api/registro marks them workspaces.onboarding_pendiente; until
// the owner finishes here, this covers the whole dashboard.
// One step per setting: company name → industry → logo (the only skippable one).
// Layout follows Asana's onboarding: logo top-left, progress bar, big
// left-aligned title, option cards, filled "Continuar" + a text link.
// Brand navy (#273D88, the logo/landing/signup blue), not the app's iOS
// --brand: this screen continues the signup, so it keeps the signup's colors.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { getPerfilUsuario } from "@/lib/perfil-usuario";
import { esAdmin } from "@/lib/roles";
import { SECTORES } from "@/lib/sectores";
import { LOGO_MAX_BYTES, subirLogoWorkspace } from "@/lib/workspace-logo";

const TOTAL_PASOS = 3;

/** Set by /registro right before entering the app, so the dashboard is covered
 *  from the first paint instead of flashing until the DB check below answers. */
export const ONBOARDING_FLAG = "pangui_onboarding_pendiente";

function leerFlag() {
  try { return localStorage.getItem(ONBOARDING_FLAG) === "1"; } catch { return false; }
}
function borrarFlag() {
  try { localStorage.removeItem(ONBOARDING_FLAG); } catch { /* storage blocked */ }
}
const sinSuscripcion = () => () => {};

export function OnboardingObligatorio() {
  const [pendiente, setPendiente] = useState<{ workspaceId: string; nombre: string } | null>(null);
  // Read during render (not in an effect) so the cover is in the very first
  // paint after signup; the server snapshot is false, so SSR never mismatches.
  const flag = useSyncExternalStore(sinSuscripcion, leerFlag, () => false);
  const [verificado, setVerificado] = useState(false);
  const cubrir = flag && !verificado;

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const p = await getPerfilUsuario();
      let esPendiente = false;
      let confirmado = !!p; // a failed lookup must not clear the flag
      if (p?.workspace_id && esAdmin(p.rol)) {
        const { data, error } = await createClient()
          .from("workspaces")
          .select("onboarding_pendiente")
          .eq("id", p.workspace_id)
          .maybeSingle();
        esPendiente = !!data?.onboarding_pendiente;
        confirmado = !error;
        if (!cancelado && esPendiente) {
          try { localStorage.setItem(ONBOARDING_FLAG, "1"); } catch { /* storage blocked */ }
          setPendiente({ workspaceId: p.workspace_id, nombre: p.nombre?.trim().split(/\s+/)[0] ?? "" });
        }
      }
      if (cancelado) return;
      if (!esPendiente) {
        if (confirmado) borrarFlag();
        setVerificado(true);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  if (pendiente) return <Asistente workspaceId={pendiente.workspaceId} primerNombre={pendiente.nombre} />;
  if (cubrir) {
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[var(--sidebar-bg)]">
        <Loader2 size={28} className="animate-spin text-[#273D88]" aria-label="Cargando" />
      </div>
    );
  }
  return null;
}

function Asistente({ workspaceId, primerNombre }: { workspaceId: string; primerNombre: string }) {
  const [paso, setPaso] = useState(1);
  const [empresa, setEmpresa] = useState("");
  const [sector, setSector] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function correr(fn: () => Promise<void>) {
    setError(null);
    setGuardando(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  function irA(n: number) {
    setError(null);
    setPaso(n);
  }

  function continuarEmpresa(e: React.FormEvent) {
    e.preventDefault();
    if (!empresa.trim()) { setError("Ingresa el nombre de tu empresa."); return; }
    irA(2);
  }

  // Company and industry are saved together once the industry is picked; from
  // there on the workspace is fully usable, the logo is extra.
  function continuarSector() {
    if (!sector) { setError("Elige la industria de tu empresa."); return; }
    void correr(async () => {
      const { error } = await createClient()
        .from("workspaces")
        .update({ nombre: empresa.trim(), sector })
        .eq("id", workspaceId);
      if (error) throw error;
      setPaso(3);
    });
  }

  function subirLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) { setError("El archivo no puede superar 2 MB."); return; }
    void correr(async () => setLogoUrl(await subirLogoWorkspace(workspaceId, file)));
  }

  function finalizar() {
    void correr(async () => {
      const { error } = await createClient()
        .from("workspaces")
        .update({ onboarding_pendiente: false })
        .eq("id", workspaceId);
      if (error) throw error;
      borrarFlag();
      // Sidebar and top bar read the name/logo on mount: reload so they pick
      // up what was just saved instead of the signup placeholders.
      window.location.reload();
    });
  }

  return (
    // z above GlobalTopBar (100), below MobileWall (9999). Same cream canvas as
    // the sidebar/top bar so it reads as part of the app, not a modal.
    <div className="fixed inset-0 z-[1000] overflow-y-auto bg-[var(--sidebar-bg)] text-[var(--fg-1)]">
      <div className="px-6 pt-6 md:px-10 md:pt-8">
        <img src="/logo2.svg" alt="Pangui" width={120} height={32} className="h-7 w-auto" />
      </div>

      <main className="mx-auto w-full max-w-[560px] px-6 pb-16 pt-10 md:pt-14">
        <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL_PASOS} aria-valuenow={paso} aria-label={`Paso ${paso} de ${TOTAL_PASOS}`}>
          <div
            className="h-full rounded-full bg-[#273D88] transition-[width] duration-500 ease-out"
            style={{ width: `${(paso / TOTAL_PASOS) * 100}%` }}
          />
        </div>

        {paso === 1 && (
          <form onSubmit={continuarEmpresa}>
            <Titulo
              titulo={primerNombre ? `Te damos la bienvenida, ${primerNombre}.` : "Te damos la bienvenida a Pangui."}
              bajada="Primero lo primero: ¿cómo se llama tu empresa? Así aparecerá en Pangui y en los informes para tus clientes."
            />
            <label htmlFor="onb-empresa" className="mb-2 mt-8 block text-[14px] font-semibold">Nombre de la empresa</label>
            <input
              id="onb-empresa"
              autoFocus
              value={empresa}
              onChange={(e) => { setEmpresa(e.target.value); setError(null); }}
              placeholder="Servicios de Mantención SpA"
              className="h-12 w-full rounded-lg border border-solid border-[var(--border)] bg-[var(--surface-1)] px-4 font-[inherit] text-[14px] text-[var(--fg-1)] shadow-[0_2px_8px_rgba(15,23,42,0.05)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--fg-4)] focus:border-[#273D88] focus:ring-[3px] focus:ring-[#273D88]/15"
            />
            <MensajeError texto={error} />
            <Acciones>
              <BotonPrimario type="submit">Continuar</BotonPrimario>
            </Acciones>
          </form>
        )}

        {paso === 2 && (
          <div>
            <Titulo titulo="¿En qué industria trabajan?" bajada="Tu elección no limita lo que puedes hacer en Pangui. Puedes cambiarla después." />
            <div role="radiogroup" aria-label="Industria" className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SECTORES.map((s) => {
                const Icon = s.icon;
                const activo = sector === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    onClick={() => { setSector(s.value); setError(null); }}
                    className={`flex cursor-pointer items-center gap-3.5 rounded-lg border-solid bg-[var(--surface-1)] px-4 py-3.5 text-left font-[inherit] text-[14px] font-semibold text-[var(--fg-1)] transition-[border-color,box-shadow] ${
                      activo
                        ? "border-2 border-[#273D88] shadow-[0_4px_16px_rgba(39,61,136,0.12)]"
                        : "border-2 border-transparent shadow-[0_2px_10px_rgba(15,23,42,0.08)] hover:shadow-[0_6px_18px_rgba(15,23,42,0.12)]"
                    }`}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#EEF1F9] text-[#273D88]">
                      <Icon size={19} strokeWidth={1.75} />
                    </span>
                    <span className="flex-1 leading-tight">{s.label}</span>
                    {activo && <Check size={17} strokeWidth={2.5} className="shrink-0 text-[#273D88]" />}
                  </button>
                );
              })}
            </div>
            <MensajeError texto={error} />
            <Acciones>
              <BotonPrimario onClick={continuarSector} disabled={guardando || !sector}>
                {guardando ? <Loader2 size={16} className="animate-spin" /> : "Continuar"}
              </BotonPrimario>
              <BotonTexto onClick={() => irA(1)} disabled={guardando}>Atrás</BotonTexto>
            </Acciones>
          </div>
        )}

        {paso === 3 && (
          <div>
            <Titulo titulo="Sube el logo de tu empresa" bajada="Aparece en el menú y en cada informe PDF que recibe tu cliente." />
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={subirLogo} />
            <div className="mt-8 flex flex-col items-center">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={guardando}
                aria-label={logoUrl ? "Cambiar logo" : "Subir logo"}
                className="flex size-[160px] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-[var(--fg-4)] bg-[var(--surface-1)] p-0 text-[var(--fg-3)] transition-colors hover:border-[#273D88] hover:text-[#273D88]"
              >
                {guardando
                  ? <Loader2 size={28} className="animate-spin" />
                  : logoUrl
                    ? <img src={logoUrl} alt="Logo de la empresa" className="size-full object-contain p-5" />
                    : <Plus size={36} strokeWidth={1.5} />}
              </button>
              <p className="mt-3 text-[14px] font-semibold">{logoUrl ? "Haz clic para cambiarlo" : "Subir logo"}</p>
              <p className="mt-1 text-[14px] text-[var(--fg-3)]">PNG, JPG o SVG, hasta 2 MB</p>
            </div>
            <MensajeError texto={error} />
            <Acciones>
              <BotonPrimario onClick={finalizar} disabled={guardando || !logoUrl}>Entrar a Pangui</BotonPrimario>
              {!logoUrl && <BotonTexto onClick={finalizar} disabled={guardando}>Omitir por ahora</BotonTexto>}
              <BotonTexto onClick={() => irA(2)} disabled={guardando} className="ml-auto">Atrás</BotonTexto>
            </Acciones>
          </div>
        )}
      </main>
    </div>
  );
}

function Titulo({ titulo, bajada }: { titulo: string; bajada: string }) {
  return (
    <div className="mt-10">
      <h1 className="text-[30px] font-semibold leading-[1.2] tracking-[-0.02em] md:text-[34px]">{titulo}</h1>
      <p className="mt-3 text-[15px] leading-[1.55] text-[var(--fg-3)]">{bajada}</p>
    </div>
  );
}

function Acciones({ children }: { children: React.ReactNode }) {
  return <div className="mt-10 flex items-center gap-6">{children}</div>;
}

// Preflight is off in this app, so buttons need their border/font reset spelled out.
type BotonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

function BotonPrimario({ className = "", type = "button", ...props }: BotonProps) {
  return (
    <button
      type={type}
      {...props}
      className={`inline-flex h-11 min-w-[120px] cursor-pointer items-center justify-center rounded-lg border-0 bg-[#273D88] px-6 font-[inherit] text-[14px] font-semibold text-white transition-colors hover:bg-[#1F316E] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    />
  );
}

function BotonTexto({ className = "", ...props }: BotonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-[14px] font-medium text-[var(--fg-3)] hover:text-[var(--fg-1)] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    />
  );
}

function MensajeError({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return <p role="alert" className="mt-4 text-[14px] text-[var(--danger)]">{texto}</p>;
}
