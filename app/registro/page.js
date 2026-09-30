"use client";
import { MARKETING_URL, marketingUrl } from "@/lib/app-urls";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { ArrowRight, Check, Eye, EyeOff, Loader2, Lock, Mail, Sparkles, User } from "lucide-react";
import { PLANS } from "@/lib/flow-plans";
import PublicPageTheme from "@/components/PublicPageTheme";
import { ONBOARDING_FLAG } from "@/components/OnboardingObligatorio";
import "../landing.css";

// Layout after MaintainX's signup: logo + login link on top, one centered card
// over a diagonal brand band. Everything inside the card is 14px.
const BENEFICIOS = ["30 días de Pro gratis", "Sin tarjeta de crédito", "Configuración en minutos"];

const inputClass =
  "h-12 w-full rounded-lg border border-[#D6DCE5] bg-white pl-11 pr-3 text-[14px] text-[#0A0B0D] outline-none transition-[border-color,box-shadow] placeholder:text-[#94A3B8] focus:border-[#273D88] focus:ring-4 focus:ring-[#273D88]/15";

function Field({ icon: Icon, label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[14px] font-semibold text-[#0A0B0D]">{label}</span>
      <span className="relative block">
        <Icon size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B]" />
        {children}
      </span>
    </label>
  );
}

export default function RegistroPage() {
  return (
    <Suspense fallback={null}>
      <RegistroPageInner />
    </Suspense>
  );
}

function RegistroPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  // ?plan=esencial when arriving from /precios — used to redirect post-signup
  // straight to /suscripcion so the user can upgrade immediately.
  const requestedPlan = search.get("plan");
  const requestedPlanDef = PLANS.find(p => p.key === requestedPlan && p.selfServe);

  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Only what's needed to get in. Company, industry and logo are asked inside
  // the dashboard by components/OnboardingObligatorio.tsx.
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [aceptaTerminos, setAceptaTerminos] = useState(false);

  function validate() {
    if (!nombre.trim()) return "Ingresa tu nombre completo.";
    if (!email.trim() || !email.includes("@")) return "Ingresa un correo válido.";
    if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
    if (!aceptaTerminos) return "Debes aceptar los Términos y la Política de Privacidad.";
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          email: email.trim().toLowerCase(),
          password,
          terms_accepted: true,
          // Surface the intent so the API can use it for routing post-signup
          requested_plan: requestedPlanDef?.key ?? null,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Error al crear la cuenta.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (loginErr) {
        setError("Cuenta creada. Inicia sesión manualmente.");
        router.push("/login");
        return;
      }

      // Lets the setup screen cover the dashboard from its first paint instead
      // of showing it until the onboarding check comes back.
      try { localStorage.setItem(ONBOARDING_FLAG, "1"); } catch { /* storage blocked */ }

      // If the user came from /precios with a specific plan in mind, drop them
      // on the subscription page so they can activate the card right away.
      // Otherwise go to /inicio with a welcome=trial toast.
      if (requestedPlanDef) {
        router.push(`/suscripcion?intent=${requestedPlanDef.key}`);
      } else {
        router.push("/inicio?welcome=trial");
      }
    } catch {
      setError("Error de red. Intenta de nuevo.");
      setLoading(false);
    }
  }

  const fuerza = password.length >= 12 ? 2 : password.length >= 8 ? 1 : 0;

  return (
    <div className="landing-root relative flex min-h-dvh flex-col overflow-hidden bg-[#F6F8FB] font-sans text-[#0A0B0D]">
      <PublicPageTheme />
      {/* Diagonal brand band behind the lower half of the card. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[52%] bg-[linear-gradient(160deg,#0f172a_0%,#1e3a8a_55%,#2563eb_100%)] [clip-path:polygon(0_100%,0_38%,16%_0,100%_0,100%_100%)] max-md:[clip-path:polygon(0_100%,0_12%,100%_0,100%_100%)]"
      />

      <header className="relative z-10 flex items-center justify-between gap-4 px-4 py-5 md:px-12 md:py-7">
        <a href={MARKETING_URL} aria-label="Pangui - inicio" className="inline-flex">
          <img src="/logo2.svg" alt="Pangui" width={120} height={32} className="h-7 w-auto md:h-8" />
        </a>
        <div className="flex items-center gap-4 text-[14px]">
          <span className="hidden text-[#475569] sm:inline">¿Ya tienes cuenta?</span>
          <Link
            href="/login"
            className="inline-flex h-10 items-center rounded-full border-2 border-[#273D88] px-5 font-semibold text-[#273D88] transition-colors hover:bg-[#273D88] hover:text-white"
          >
            Iniciar sesión
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-10 pt-4 md:pb-16">
        <div className="w-full max-w-[560px] rounded-2xl bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.14)] md:p-10">
          <h1 className="font-display text-[30px] font-bold leading-[1.1] tracking-[-0.03em] md:text-[34px]">
            Crea tu cuenta
          </h1>
          <p className="mt-2 text-[14px] text-[#475569]">
            Empieza a respaldar cada trabajo hoy. 30 días de Pro gratis, sin tarjeta.
          </p>

          {requestedPlanDef && (
            <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3.5 py-3 text-[14px] leading-[1.45] text-[#1E40AF]">
              <Sparkles size={15} className="mt-0.5 shrink-0" />
              <p>
                Vienes interesado en <strong>{requestedPlanDef.name}</strong>. Crea tu cuenta con 30 días de Pro gratis y al terminar lo activas en un clic.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            <Field icon={User} label="Nombre completo">
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Juan Pérez" required autoComplete="name" className={inputClass} />
            </Field>

            <Field icon={Mail} label="Email de trabajo">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@empresa.cl" required autoComplete="email" autoCapitalize="none" className={inputClass} />
            </Field>

            <div>
              <Field icon={Lock} label="Contraseña">
                <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" required autoComplete="new-password" className={`${inputClass} pr-12`} />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute right-3 top-1/2 flex -translate-y-1/2 p-1 text-[#64748B] hover:text-[#0A0B0D]"
                >
                  {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </Field>
              {password.length > 0 && (
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1 flex-1 rounded-full bg-[#E2E8F0]">
                    <div
                      className={`h-full rounded-full transition-all ${["w-1/3 bg-[#EF4444]", "w-2/3 bg-[#F59E0B]", "w-full bg-[#10B981]"][fuerza]}`}
                    />
                  </div>
                  <span className="text-[14px] text-[#64748B]">{["Muy corta", "Aceptable", "Fuerte"][fuerza]}</span>
                </div>
              )}
            </div>

            <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-[1.5] text-[#475569]">
              <input
                type="checkbox"
                checked={aceptaTerminos}
                onChange={(e) => setAceptaTerminos(e.target.checked)}
                required
                className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-[#273D88]"
              />
              <span>
                Acepto los{" "}
                <a href={marketingUrl("terminos")} target="_blank" rel="noopener" className="font-semibold text-[#0A0B0D] underline">Términos y condiciones</a>
                {" "}y la{" "}
                <a href={marketingUrl("privacidad")} target="_blank" rel="noopener" className="font-semibold text-[#0A0B0D] underline">Política de privacidad</a>
                {" "}de Pangui.
              </span>
            </label>

            {error && (
              <p role="alert" className="rounded-lg border-l-[3px] border-[#EF4444] bg-[#FEF2F2] px-3.5 py-2.5 text-[14px] text-[#DC2626]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#273D88] text-[14px] font-semibold text-white transition-colors hover:bg-[#1F316E] disabled:cursor-not-allowed disabled:bg-[#64748B]"
            >
              {loading ? <><Loader2 size={17} className="animate-spin" /> Creando cuenta...</> : <>Crear cuenta <ArrowRight size={17} /></>}
            </button>
          </form>
        </div>

        <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[14px] font-medium text-white">
          {BENEFICIOS.map((b) => (
            <li key={b} className="flex items-center gap-2">
              <Check size={16} strokeWidth={2.5} className="text-[#6EE7B7]" />
              {b}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
