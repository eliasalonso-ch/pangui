"use client";

import { useEffect, useState } from "react";
import { CreditCard, Loader2, Mail, Pencil, ReceiptText, X, type LucideIcon } from "lucide-react";
import { CardPreview } from "@/components/CardPreview";
import { GiroSelect } from "@/components/GiroSelect";
import { rutEsValido, formatearRut } from "@/lib/tributario";
import {
  NOMBRES_REGIONES, comunasDeRegion, comunaPerteneceARegion,
  comunaCanonica, regionCanonica,
} from "@/lib/regiones-comunas";

// Datos del receptor de la factura electrónica afecta a IVA. El giro y la
// ciudad los exige la factura y no los pedía la boleta de honorarios anterior.
// Ver 20260817120000_facturacion_spa_iva.sql.
interface BillingProfile {
  billing_email: string | null;
  razon_social: string | null;
  rut: string | null;
  giro: string | null;
  domicilio: string | null;
  region: string | null;
  comuna: string | null;
  ciudad: string | null;
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
  changingCard: boolean;
  removingCard: boolean;
  // La tabla de plan actual solo tiene sentido con una suscripción pagada; en
  // prueba o plan gratis muestra un "producto" que nadie contrató.
  showPlanSummary: boolean;
  // Cancelada al final del período: sigue "active" y con acceso, pero no
  // renueva. La columna debe decir "Acceso hasta", no "Renovación".
  canceledAt: string | null;
  onChangeCard: () => void;
  onRemoveCard: () => void;
  // Avisa a la página si ya hay datos suficientes para emitir la boleta. Sin
  // ellos no se puede contratar un plan: el cobro llegaría sin RUT ni nombre
  // del receptor y no habría cómo emitir el documento tributario.
  onProfileReadyChange?: (ready: boolean) => void;
}

const emptyProfile: BillingProfile = {
  billing_email: null, razon_social: null, rut: null, giro: null,
  domicilio: null, region: null, comuna: null, ciudad: null,
};

const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
// timeZone UTC: los períodos se guardan a medianoche UTC y son días calendario,
// no instantes. Sin esto, en Chile (UTC−4) se muestran un día antes.
const date = (value: string | null) => value ? new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)) : "—";

export function SubscriptionOverview(props: Props) {
  const [profile, setProfile] = useState<BillingProfile>({ ...emptyProfile, billing_email: props.billingEmail });
  const [draft, setDraft] = useState<BillingProfile>(profile);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
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
          // Los perfiles guardados antes de los selectores tienen región y
          // comuna escritas a mano, a menudo sin tilde ("Concepcion"). Se
          // llevan al nombre oficial para que el <select> encuentre la opción;
          // sin esto el campo aparecía vacío, como si el dato se hubiera
          // perdido.
          const next = {
            ...emptyProfile,
            ...json,
            billing_email: json.billing_email || props.billingEmail,
            region: regionCanonica(json.region) ?? json.region ?? null,
            comuna: comunaCanonica(json.comuna) ?? json.comuna ?? null,
          };
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
      // La factura electrónica exige identificar al receptor por RUT, razón
      // social, giro y dirección completa.
      if (kind === "address") {
        if (!draft.razon_social || !draft.rut || !draft.giro || !draft.domicilio || !draft.region || !draft.comuna || !draft.ciudad) {
          throw new Error("Completa razón social, RUT, giro, dirección, región, comuna y ciudad.");
        }
        // Un RUT mal tipeado no se descubre al guardar sino al emitir, cuando
        // el SII rechaza la factura y el cobro ya ocurrió.
        if (!rutEsValido(draft.rut)) {
          throw new Error("El RUT no es válido. Revisa el número y el dígito verificador.");
        }
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

  const hasCard = Boolean(props.cardBrand || props.cardLast4);

  // La confirmación se cierra sola cuando la tarjeta ya no está. Cerrarla al
  // hacer clic ocultaría el error si la baja en Flow falla.
  useEffect(() => {
    if (!hasCard) setConfirmRemove(false);
  }, [hasCard]);
  const profileComplete = Boolean(
    profile.razon_social && profile.rut && profile.giro &&
    profile.domicilio && profile.region && profile.comuna && profile.ciudad
  );
  // Para contratar hace falta además el correo al que enviaremos la factura.
  // Mientras carga no damos por bueno el perfil: habilitar los planes y luego
  // apagarlos deja elegir un plan en la ventana intermedia.
  const profileReady = !loading && profileComplete && Boolean(profile.billing_email);

  const { onProfileReadyChange } = props;
  useEffect(() => {
    onProfileReadyChange?.(profileReady);
  }, [profileReady, onProfileReadyChange]);

  return (
    <>
      {/* Una sola columna: el aside de 340px empujaba email, tarjeta y datos de
          la boleta a un margen visual, cuando son requisitos para contratar. */}
      <div style={{ display: "grid", gap: 14 }}>
        {props.showPlanSummary && (
          <div style={panelStyle}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 660, fontSize: 13, color: "var(--fg-1)" }}>
                <thead>
                  <tr style={{ background: "var(--surface-1)" }}>
                    <Header>Producto</Header><Header>Estado</Header><Header>{props.canceledAt ? "Acceso hasta" : "Renovación"}</Header><Header>Precio</Header>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <Cell><strong>Pangui {props.planName}</strong><span style={subtext}>{props.activeUsers} {props.activeUsers === 1 ? "usuario activo" : "usuarios activos"}</span></Cell>
                    <Cell><span style={statusStyle(props.canceledAt ? "canceled" : props.status)}>{props.canceledAt ? "Cancelada" : props.statusLabel}</span></Cell>
                    <Cell>{date(props.renewalDate)}</Cell>
                    <Cell><strong>{money(props.totalPrice)}/mes</strong><span style={subtext}>{money(props.unitPrice)} por usuario</span></Cell>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ margin: 0, padding: "0 14px 12px", fontSize: 12.5, color: "var(--fg-3)", lineHeight: 1.5 }}>
              {props.canceledAt
                ? `Cancelaste esta suscripción. No habrá nuevos cobros y mantienes acceso hasta el ${date(props.renewalDate)}.`
                : "Se renueva automáticamente al final del período. Los cambios de usuarios activos se reflejan en el próximo cobro."}
            </p>
          </div>
        )}

        {/* Sin align-items:start — el default (stretch) iguala las alturas. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          <SideCard title="Email de cobros" icon={Mail} onEdit={() => { setDraft(profile); setConfirmEmail(""); setError(null); setEditingEmail(true); }}>
            <div style={sideRow}><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{profile.billing_email || props.billingEmail || "Sin configurar"}</span></div>
          </SideCard>

          <SideCard title="Datos de facturación" icon={ReceiptText} onEdit={() => { setDraft(profile); setError(null); setEditingAddress(true); }}>
            {loading ? <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 16, color: "var(--fg-4)" }}><Loader2 size={16} className="animate-spin" /></div> : profileComplete ? (
              <div style={sideRow}>
                <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  <strong style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{profile.razon_social}</strong>
                  <span>{profile.rut ? formatearRut(profile.rut) : ""}</span>
                  <span style={subtext}>{profile.giro}</span>
                  <span style={subtext}>{profile.domicilio}</span>
                  <span style={subtext}>{profile.comuna}, {profile.ciudad}</span>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => { setDraft(profile); setError(null); setEditingAddress(true); }} style={{ flex: 1, margin: 14, padding: 12, border: "1px dashed var(--border-strong)", borderRadius: "var(--r-md)", background: "transparent", color: "var(--brand)", cursor: "pointer", textAlign: "left", fontSize: 13, fontFamily: "inherit" }}>
                Agregar datos de facturación
              </button>
            )}
          </SideCard>
        </div>

        {/* Método de pago — inactivo mientras el cobro sea por link de pago.
            Flow solo ofrece "Cargo automático" a empresas (ver el comentario en
            /api/suscripcion/register), así que hoy no hay tarjeta que guardar y
            esta sección no se renderiza.

            El bloque se conserva íntegro a propósito: cuando se contrate cargo
            automático basta con volver a mostrarlo. `hasCard` sigue siendo la
            condición correcta — un workspace con tarjeta inscrita la ve.

            Método de pago en su propia fila: la tarjeta necesita ancho para
            leerse, y apretada en un tercio del grid competía con dos tarjetas
            que son solo texto. */}
        {hasCard && (
          <SideCard title="Método de pago" icon={CreditCard}>
            {hasCard ? (
              <div style={{ padding: 16, display: "grid", gap: 14 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ width: "min(340px, 100%)" }}>
                    <CardPreview brand={props.cardBrand} last4={props.cardLast4} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button type="button" onClick={props.onChangeCard} disabled={props.changingCard} style={smallButton}>{props.changingCard ? <Loader2 size={13} className="animate-spin" /> : "Actualizar"}</button>
                    <button type="button" onClick={() => setConfirmRemove(true)} disabled={props.removingCard || confirmRemove} style={{ ...smallButton, color: "var(--danger)" }}>Eliminar</button>
                  </div>
                </div>

                {/* Confirmación en línea, igual que "Cancelar suscripción":
                    eliminar la tarjeta deja la suscripción sin medio de pago y
                    el próximo cobro falla, así que no puede ser un solo clic. */}
                {confirmRemove && (
                  <div style={{ padding: 13, border: "1px solid var(--danger)", borderRadius: "var(--r-md)", background: "var(--surface-0)", display: "grid", gap: 10 }}>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--fg-1)" }}>
                      ¿Eliminar la tarjeta terminada en <strong>{props.cardLast4}</strong>?
                      {props.showPlanSummary
                        ? " Tu suscripción sigue activa, pero el próximo cobro fallará si no registras otra antes."
                        : " Tendrás que registrar una nueva para volver a suscribirte."}
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={props.onRemoveCard} disabled={props.removingCard} style={{ ...smallButton, borderColor: "var(--danger)", background: "var(--danger)", color: "white" }}>
                        {props.removingCard ? <Loader2 size={13} className="animate-spin" /> : "Sí, eliminar"}
                      </button>
                      <button type="button" onClick={() => setConfirmRemove(false)} style={smallButton}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Suscripción activa sin tarjeta: el próximo cobro va a fallar,
                 así que hay que poder agregarla desde aquí. */
              <div style={{ padding: 16, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--warning)", maxWidth: 460 }}>
                  Sin tarjeta registrada. Agrega una antes del próximo cobro para no perder el acceso.
                </p>
                <button type="button" onClick={props.onChangeCard} disabled={props.changingCard} style={smallButton}>
                  {props.changingCard ? <Loader2 size={13} className="animate-spin" /> : "Agregar tarjeta"}
                </button>
              </div>
            )}
          </SideCard>
        )}

        {error ? <p style={{ margin: 0, color: "var(--danger)", fontSize: 12 }}>{error}</p> : null}
      </div>

      {editingEmail ? (
        <ModalShell title="Email de cobros" width={410} onClose={() => setEditingEmail(false)}>
          <div style={{ padding: 18, display: "grid", gap: 16 }}>
            <p style={{ margin: 0, color: "var(--fg-3)", fontSize: 13 }}>Email actual: {profile.billing_email || props.billingEmail || "Sin configurar"}</p>
            <Field label="Nuevo email" value={draft.billing_email} onChange={value => setDraft({ ...draft, billing_email: value })} placeholder="Ingresa el nuevo email" />
            <Field label="Confirmar nuevo email" value={confirmEmail} onChange={setConfirmEmail} placeholder="Confirma el nuevo email" />
            <p style={{ margin: 0, color: "var(--fg-3)", fontSize: 12.5, lineHeight: 1.5 }}>
              Flow.cl envía a este correo el comprobante de cada cobro. La factura
              electrónica se emite por separado y llega al mismo correo.
            </p>
          </div>
          <ModalFooter error={error} saving={saving} onCancel={() => setEditingEmail(false)} onSave={() => void save("email")} />
        </ModalShell>
      ) : null}

      {editingAddress ? (
        // 620px y no 430 como los otros modales: este formulario tiene siete
        // campos, y los nombres de giro del SII son largos ("ACTIVIDADES DE
        // CONSULTORÍA DE INFORMÁTICA Y DE GESTIÓN DE INSTALACIONES
        // INFORMÁTICAS"). Angosto se truncaban y quedaba una columna muy alta.
        <ModalShell title="Datos de facturación" width={620} onClose={() => setEditingAddress(false)}>
          {/* auto-fit + minmax en vez de "1fr 1fr": en un teléfono las dos
              columnas colapsan solas a una sin necesidad de media queries. */}
          <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
            <p style={{ margin: "0 0 2px", gridColumn: "1 / -1", color: "var(--fg-3)", fontSize: 13, lineHeight: 1.45 }}>
              Usamos estos datos como receptor en la factura electrónica que emitimos
              ante el SII. La factura exige RUT, razón social, giro y dirección completa
              del receptor.
            </p>
            {/* Razón social y RUT comparten fila: el RUT es corto y dejarlo solo
                en una línea desperdicia el ancho. */}
            <Field label="Razón social" value={draft.razon_social} onChange={value => setDraft({ ...draft, razon_social: value })} />
            <Field label="RUT" value={draft.rut} onChange={value => setDraft({ ...draft, rut: value })} placeholder="76.123.456-7" />
            <GiroSelect
              value={draft.giro}
              onChange={valor => setDraft({ ...draft, giro: valor })}
              inputStyle={inputStyle}
            />
            <Field label="Dirección" value={draft.domicilio} onChange={value => setDraft({ ...draft, domicilio: value })} placeholder="Calle, número, oficina" wide />
            <label style={{ display: "grid", gap: 6, color: "var(--fg-2)", fontSize: 12.5, fontWeight: 600 }}>
              Región
              <select
                value={draft.region ?? ""}
                onChange={event => {
                  // Cambiar de región invalida la comuna elegida: sin esto se
                  // podía guardar "Coronel, Metropolitana", una dirección
                  // imposible, en un documento tributario.
                  const region = event.target.value || null;
                  const comuna = draft.comuna && comunaPerteneceARegion(draft.comuna, region ?? "")
                    ? draft.comuna
                    : null;
                  setDraft({ ...draft, region, comuna, ciudad: comuna ?? null });
                }}
                style={inputStyle}
              >
                <option value="">Seleccione región…</option>
                {NOMBRES_REGIONES.map(region => <option key={region} value={region}>{region}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6, color: "var(--fg-2)", fontSize: 12.5, fontWeight: 600 }}>
              Comuna
              <select
                value={draft.comuna ?? ""}
                onChange={event => {
                  // La ciudad se rellena con la comuna, que es lo correcto en la
                  // gran mayoría de las direcciones comerciales, y queda
                  // editable para los casos donde difiere.
                  const comuna = event.target.value || null;
                  setDraft({ ...draft, comuna, ciudad: comuna ?? draft.ciudad });
                }}
                disabled={!draft.region}
                style={{ ...inputStyle, opacity: draft.region ? 1 : 0.55 }}
              >
                <option value="">
                  {draft.region ? "Seleccione comuna…" : "Elige primero una región"}
                </option>
                {comunasDeRegion(draft.region).map(comuna => (
                  <option key={comuna} value={comuna}>{comuna}</option>
                ))}
              </select>
            </label>
            <Field label="Ciudad" value={draft.ciudad} onChange={value => setDraft({ ...draft, ciudad: value })} placeholder="Ej. Concepción" wide />
          </div>
          <ModalFooter error={error} saving={saving} onCancel={() => setEditingAddress(false)} onSave={() => void save("address")} />
        </ModalShell>
      ) : null}
    </>
  );
}

// El icono va en el encabezado, no junto al dato: identifica la tarjeta de un
// vistazo y deja el contenido alineado con el de las otras dos.
// height:100% + flex hace que las tres tarjetas de una fila midan igual y que
// su cuerpo ocupe el alto sobrante (el grid las estira con align-items:stretch).
function SideCard({ title, icon: Icon, onEdit, children }: { title: string; icon: LucideIcon; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <section style={{ ...panelStyle, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 40, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", color: "var(--fg-3)", fontSize: 13, fontWeight: 600 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Icon size={15} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        </span>
        {onEdit ? <button type="button" onClick={onEdit} style={iconButton} aria-label={`Editar ${title}`}><Pencil size={14} /></button> : null}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>{children}</div>
    </section>
  );
}
function ModalShell({ title, width, onClose, children }: { title: string; width: number; onClose: () => void; children: React.ReactNode }) {
  return <div role="dialog" aria-modal="true" aria-label={title} style={overlayStyle}><div style={{ width: `min(${width}px, calc(100vw - 32px))`, maxHeight: "calc(100dvh - 32px)", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", background: "var(--surface-1)", boxShadow: "var(--shadow-lg)" }}><div style={{ minHeight: 56, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--border)" }}><h2 style={{ margin: 0, fontSize: 17, color: "var(--fg-1)" }}>{title}</h2><button type="button" onClick={onClose} style={{ ...iconButton, border: "1px solid var(--border)" }} aria-label="Cerrar"><X size={17} /></button></div>{children}</div></div>;
}
function ModalFooter({ error, saving, onCancel, onSave }: { error: string | null; saving: boolean; onCancel: () => void; onSave: () => void }) {
  return <>{error ? <p role="alert" style={{ margin: "0 18px 12px", color: "var(--danger)", fontSize: 12 }}>{error}</p> : null}<div style={{ padding: "12px 18px", display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--border)" }}><button type="button" onClick={onCancel} style={smallButton}>Cancelar</button><button type="button" onClick={onSave} disabled={saving} style={{ ...smallButton, minHeight: 36, background: "var(--brand)", borderColor: "var(--brand)", color: "white" }}>{saving ? <Loader2 size={14} className="animate-spin" /> : "Guardar"}</button></div></>;
}
function Header({ children }: { children: React.ReactNode }) { return <th style={{ height: 46, padding: "0 16px", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{children}</th>; }
function Cell({ children }: { children: React.ReactNode }) { return <td style={{ height: 64, padding: "8px 16px", verticalAlign: "middle" }}><div style={{ display: "grid", gap: 3 }}>{children}</div></td>; }
function Field({ label, value, onChange, wide, placeholder }: { label: string; value: string | null; onChange: (value: string) => void; wide?: boolean; placeholder?: string }) { return <label style={{ display: "grid", gap: 6, gridColumn: wide ? "1 / -1" : undefined, color: "var(--fg-2)", fontSize: 12.5, fontWeight: 600 }}>{label}<input value={value ?? ""} placeholder={placeholder} onChange={event => onChange(event.target.value)} style={inputStyle} /></label>; }
function statusStyle(status: string): React.CSSProperties { const active = status === "active" || status === "trialing"; return { width: "fit-content", padding: "3px 9px", border: "1px solid var(--border)", borderRadius: 999, color: active ? "var(--success)" : status === "past_due" ? "var(--warning)" : "var(--fg-3)", fontSize: 12, fontWeight: 600 }; }
const panelStyle: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden", background: "var(--surface-1)" };
// flex:1 para que la fila ocupe el alto que le sobra a la tarjeta: con las tres
// tarjetas estiradas a la misma altura, si no crece el texto queda flotando.
const sideRow: React.CSSProperties = { flex: 1, padding: 14, display: "flex", alignItems: "center", gap: 9, color: "var(--fg-2)", fontSize: 13, lineHeight: 1.45 };
const subtext: React.CSSProperties = { color: "var(--fg-4)", fontSize: 11.5, fontWeight: 400 };
const smallButton: React.CSSProperties = { minHeight: 30, padding: "0 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const iconButton: React.CSSProperties = { width: 30, height: 30, display: "grid", placeItems: "center", border: 0, borderRadius: "var(--r-md)", background: "transparent", color: "var(--fg-2)", cursor: "pointer" };
const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", padding: 16, background: "rgba(0,0,0,.45)", backdropFilter: "blur(4px)" };
const inputStyle: React.CSSProperties = { height: 40, padding: "0 11px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-0)", color: "var(--fg-1)", outline: "none", font: "inherit", fontWeight: 400 };
