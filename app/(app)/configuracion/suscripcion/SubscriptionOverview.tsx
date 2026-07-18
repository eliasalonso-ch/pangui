"use client";

import { useEffect, useState } from "react";
import { CreditCard, Loader2, Mail, MapPin, Pencil, X } from "lucide-react";
import { CardBrandLogo } from "@/components/CardBrandLogo";

interface BillingProfile {
  billing_email: string | null;
  razon_social: string | null;
  rut: string | null;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  region: string | null;
  pais: string | null;
  receive_pdf_invoices: boolean;
  invoice_language: "es" | "en";
}

interface Props {
  planName: string;
  status: string;
  statusLabel: string;
  renewalDate: string | null;
  unitPrice: number;
  totalPrice: number;
  activeUsers: number;
  cardBrand: string | null;
  cardLast4: string | null;
  billingEmail: string | null;
  payMode: string | null;
  changingCard: boolean;
  removingCard: boolean;
  canChangeCard: boolean;
  onChangeCard: () => void;
  onRemoveCard: () => void;
}

const emptyProfile: BillingProfile = {
  billing_email: null, razon_social: null, rut: null, giro: null, direccion: null,
  comuna: null, ciudad: null, region: null, pais: "Chile",
  receive_pdf_invoices: true, invoice_language: "es",
};

const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";

export function SubscriptionOverview(props: Props) {
  const [profile, setProfile] = useState<BillingProfile>({ ...emptyProfile, billing_email: props.billingEmail });
  const [draft, setDraft] = useState<BillingProfile>(profile);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/suscripcion/billing-profile", { cache: "no-store" })
      .then(async response => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "No se pudieron cargar los datos de facturación.");
        if (active) {
          const next = { ...emptyProfile, ...json, billing_email: json.billing_email || props.billingEmail };
          setProfile(next);
          setDraft(next);
        }
      })
      .catch(fetchError => { if (active) setError((fetchError as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [props.billingEmail]);

  async function save(kind: "email" | "address") {
    setSaving(true);
    setError(null);
    try {
      if (kind === "email") {
        if (!draft.billing_email || !/^\S+@\S+\.\S+$/.test(draft.billing_email)) throw new Error("Ingresa un email válido.");
        if (draft.billing_email !== confirmEmail) throw new Error("Los emails no coinciden.");
      }
      if (kind === "address" && (!draft.razon_social || !draft.rut || !draft.giro || !draft.direccion || !draft.comuna || !draft.ciudad)) {
        throw new Error("Completa razón social, RUT, giro, dirección, comuna y ciudad.");
      }
      const response = await fetch("/api/suscripcion/billing-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "No se pudieron guardar los datos.");
      setProfile(json);
      setDraft(json);
      setEditingEmail(false);
      setEditingAddress(false);
      setConfirmEmail("");
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const profileComplete = Boolean(profile.razon_social && profile.rut && profile.direccion && profile.comuna);

  return (
    <>
      <div className="billing-overview-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 24, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={noticeStyle}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--fg-2)", lineHeight: 1.5 }}>
              Tu suscripción se renueva automáticamente al final del período vigente. Los cambios de usuarios activos se reflejan en el próximo cobro.
            </p>
          </div>

          <div style={panelStyle}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 660, fontSize: 13, color: "var(--fg-1)" }}>
                <thead>
                  <tr style={{ background: "var(--surface-1)" }}>
                    <Header>Producto</Header><Header>Estado</Header><Header>Renovación</Header><Header>Precio</Header>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <Cell><strong>Pangui {props.planName}</strong><span style={subtext}>{props.activeUsers} {props.activeUsers === 1 ? "usuario activo" : "usuarios activos"}</span></Cell>
                    <Cell><span style={statusStyle(props.status)}>{props.statusLabel}</span></Cell>
                    <Cell>{date(props.renewalDate)}</Cell>
                    <Cell><strong>{money(props.totalPrice)}/mes</strong><span style={subtext}>{money(props.unitPrice)} por usuario</span></Cell>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside style={{ display: "grid", gap: 14 }}>
          <SideCard title="Email de facturación" onEdit={() => { setDraft(profile); setConfirmEmail(""); setError(null); setEditingEmail(true); }}>
            <div style={sideRow}><Mail size={15} /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{profile.billing_email || props.billingEmail || "Sin configurar"}</span></div>
          </SideCard>

          <SideCard title="Método de pago">
            {props.cardBrand || props.cardLast4 ? (
              <>
                <div style={{ margin: "0 14px 10px", padding: 14, minHeight: 116, border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-0)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <CardBrandLogo brand={props.cardBrand} height={32} />
                  <div>
                    <p style={{ margin: 0, fontSize: 15, letterSpacing: 2, color: "var(--fg-2)" }}>•••• •••• •••• {props.cardLast4 || "••••"}</p>
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--fg-4)" }}>Procesada por Flow.cl</p>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0 14px 12px" }}>
                  <button type="button" onClick={props.onChangeCard} disabled={props.changingCard} style={smallButton}>{props.changingCard ? <Loader2 size={13} className="animate-spin" /> : "Actualizar"}</button>
                  <button type="button" onClick={props.onRemoveCard} disabled={props.removingCard} style={{ ...smallButton, color: "var(--danger)" }}>{props.removingCard ? <Loader2 size={13} className="animate-spin" /> : "Eliminar"}</button>
                </div>
              </>
            ) : (
              <div style={{ padding: "18px 14px", display: "grid", gap: 10, color: "var(--fg-3)", fontSize: 13 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}><CreditCard size={16} /><span>{props.payMode === "manual" ? "Pago manual en Flow.cl" : "Sin tarjeta registrada"}</span></div>
                {props.canChangeCard ? <button type="button" onClick={props.onChangeCard} style={{ ...smallButton, width: "fit-content" }}>Agregar tarjeta</button> : null}
              </div>
            )}
          </SideCard>

          <SideCard title="Dirección de facturación" onEdit={() => { setDraft(profile); setError(null); setEditingAddress(true); }}>
            {loading ? <div style={{ padding: 16 }}><Loader2 size={16} className="animate-spin" /></div> : profileComplete ? (
              <div style={{ ...sideRow, alignItems: "flex-start" }}>
                <MapPin size={15} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ display: "grid", gap: 4 }}>
                  <strong>{profile.razon_social}</strong><span>{profile.rut}</span><span>{profile.giro}</span>
                  <span>{profile.direccion}</span><span>{[profile.comuna, profile.ciudad, profile.region].filter(Boolean).join(", ")}</span><span>{profile.pais || "Chile"}</span>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => { setDraft(profile); setError(null); setEditingAddress(true); }} style={{ margin: 14, padding: 12, border: "1px dashed var(--border-strong)", borderRadius: "var(--r-md)", background: "transparent", color: "var(--brand)", cursor: "pointer", textAlign: "left" }}>
                Agregar datos para emitir facturas electrónicas
              </button>
            )}
          </SideCard>
          {error ? <p style={{ margin: 0, color: "var(--danger)", fontSize: 12 }}>{error}</p> : null}
        </aside>
      </div>

      {editingEmail ? (
        <ModalShell title="Preferencias de email de facturación" width={410} onClose={() => setEditingEmail(false)}>
          <div style={{ padding: 18, display: "grid", gap: 16 }}>
            <p style={{ margin: 0, color: "var(--fg-3)", fontSize: 13 }}>Email actual: {profile.billing_email || props.billingEmail || "Sin configurar"}</p>
            <Field label="Nuevo email" value={draft.billing_email} onChange={value => setDraft({ ...draft, billing_email: value })} placeholder="Ingresa el nuevo email" />
            <Field label="Confirmar nuevo email" value={confirmEmail} onChange={setConfirmEmail} placeholder="Confirma el nuevo email" />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={modalLabel}>Recibir facturas en PDF</span>
              <Toggle checked={draft.receive_pdf_invoices} onChange={checked => setDraft({ ...draft, receive_pdf_invoices: checked })} />
            </div>
            <label style={{ display: "grid", gap: 6, color: "var(--fg-2)", fontSize: 12.5, fontWeight: 600 }}>
              Idioma de las facturas
              <select value={draft.invoice_language} onChange={event => setDraft({ ...draft, invoice_language: event.target.value as "es" | "en" })} style={inputStyle}>
                <option value="es">Español</option><option value="en">Inglés</option>
              </select>
            </label>
          </div>
          <ModalFooter error={error} saving={saving} onCancel={() => setEditingEmail(false)} onSave={() => void save("email")} />
        </ModalShell>
      ) : null}

      {editingAddress ? (
        <ModalShell title="Actualizar dirección de facturación" width={590} onClose={() => setEditingAddress(false)}>
          <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <p style={{ gridColumn: "1 / -1", margin: "0 0 2px", color: "var(--fg-3)", fontSize: 13, lineHeight: 1.45 }}>
              Estos datos se mostrarán en tus facturas y se utilizarán para fines tributarios. No modifican la dirección asociada a tu tarjeta en Flow.cl.
            </p>
            <Field label="Razón social" value={draft.razon_social} onChange={value => setDraft({ ...draft, razon_social: value })} wide />
            <Field label="RUT" value={draft.rut} onChange={value => setDraft({ ...draft, rut: value })} placeholder="76.123.456-7" />
            <Field label="Giro" value={draft.giro} onChange={value => setDraft({ ...draft, giro: value })} />
            <Field label="País" value={draft.pais} onChange={value => setDraft({ ...draft, pais: value })} wide />
            <Field label="Dirección" value={draft.direccion} onChange={value => setDraft({ ...draft, direccion: value })} wide />
            <Field label="Comuna" value={draft.comuna} onChange={value => setDraft({ ...draft, comuna: value })} />
            <Field label="Ciudad" value={draft.ciudad} onChange={value => setDraft({ ...draft, ciudad: value })} />
            <Field label="Región" value={draft.region} onChange={value => setDraft({ ...draft, region: value })} wide />
          </div>
          <ModalFooter error={error} saving={saving} onCancel={() => setEditingAddress(false)} onSave={() => void save("address")} />
        </ModalShell>
      ) : null}
      <style jsx global>{`@media (max-width: 900px) { .billing-overview-grid { grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}

function SideCard({ title, onEdit, children }: { title: string; onEdit?: () => void; children: React.ReactNode }) {
  return <section style={panelStyle}><div style={{ height: 40, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", color: "var(--fg-3)", fontSize: 13, fontWeight: 600 }}><span>{title}</span>{onEdit ? <button type="button" onClick={onEdit} style={iconButton} aria-label={`Editar ${title}`}><Pencil size={14} /></button> : null}</div>{children}</section>;
}
function ModalShell({ title, width, onClose, children }: { title: string; width: number; onClose: () => void; children: React.ReactNode }) {
  return <div role="dialog" aria-modal="true" aria-label={title} style={overlayStyle}><div style={{ width: `min(${width}px, calc(100vw - 32px))`, maxHeight: "calc(100dvh - 32px)", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", background: "var(--surface-1)", boxShadow: "var(--shadow-lg)" }}><div style={{ minHeight: 56, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--border)" }}><h2 style={{ margin: 0, fontSize: 17, color: "var(--fg-1)" }}>{title}</h2><button type="button" onClick={onClose} style={{ ...iconButton, border: "1px solid var(--border)" }} aria-label="Cerrar"><X size={17} /></button></div>{children}</div></div>;
}
function ModalFooter({ error, saving, onCancel, onSave }: { error: string | null; saving: boolean; onCancel: () => void; onSave: () => void }) {
  return <>{error ? <p role="alert" style={{ margin: "0 18px 12px", color: "var(--danger)", fontSize: 12 }}>{error}</p> : null}<div style={{ padding: "12px 18px", display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--border)" }}><button type="button" onClick={onCancel} style={smallButton}>Cancelar</button><button type="button" onClick={onSave} disabled={saving} style={{ ...smallButton, minHeight: 36, background: "var(--brand)", borderColor: "var(--brand)", color: "white" }}>{saving ? <Loader2 size={14} className="animate-spin" /> : "Guardar"}</button></div></>;
}
function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} style={{ width: 42, height: 24, padding: 2, border: 0, borderRadius: 999, background: checked ? "var(--brand)" : "var(--surface-hover)", cursor: "pointer", transition: "background .15s" }}><span style={{ display: "block", width: 20, height: 20, borderRadius: "50%", background: "white", boxShadow: "var(--shadow-sm)", transform: `translateX(${checked ? 18 : 0}px)`, transition: "transform .15s" }} /></button>;
}
function Header({ children }: { children: React.ReactNode }) { return <th style={{ height: 46, padding: "0 16px", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{children}</th>; }
function Cell({ children }: { children: React.ReactNode }) { return <td style={{ height: 64, padding: "8px 16px", verticalAlign: "middle" }}><div style={{ display: "grid", gap: 3 }}>{children}</div></td>; }
function Field({ label, value, onChange, wide, placeholder }: { label: string; value: string | null; onChange: (value: string) => void; wide?: boolean; placeholder?: string }) { return <label style={{ display: "grid", gap: 6, gridColumn: wide ? "1 / -1" : undefined, color: "var(--fg-2)", fontSize: 12.5, fontWeight: 600 }}>{label}<input value={value ?? ""} placeholder={placeholder} onChange={event => onChange(event.target.value)} style={inputStyle} /></label>; }
function statusStyle(status: string): React.CSSProperties { const active = status === "active" || status === "trialing"; return { width: "fit-content", padding: "3px 9px", border: "1px solid var(--border)", borderRadius: 999, color: active ? "var(--success)" : status === "past_due" ? "var(--warning)" : "var(--fg-3)", fontSize: 12, fontWeight: 600 }; }
const panelStyle: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden", background: "var(--surface-1)" };
const noticeStyle: React.CSSProperties = { padding: "14px 16px", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)" };
const sideRow: React.CSSProperties = { padding: 14, display: "flex", alignItems: "center", gap: 9, color: "var(--fg-2)", fontSize: 13, lineHeight: 1.45 };
const subtext: React.CSSProperties = { color: "var(--fg-4)", fontSize: 11.5, fontWeight: 400 };
const smallButton: React.CSSProperties = { minHeight: 30, padding: "0 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const iconButton: React.CSSProperties = { width: 30, height: 30, display: "grid", placeItems: "center", border: 0, borderRadius: "var(--r-md)", background: "transparent", color: "var(--fg-2)", cursor: "pointer" };
const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", padding: 16, background: "rgba(0,0,0,.45)", backdropFilter: "blur(4px)" };
const inputStyle: React.CSSProperties = { height: 40, padding: "0 11px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-0)", color: "var(--fg-1)", outline: "none", font: "inherit", fontWeight: 400 };
const modalLabel: React.CSSProperties = { color: "var(--fg-2)", fontSize: 12.5, fontWeight: 600 };
