"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import styles from "./Topbar.module.css";

// ── Pangi Icon ────────────────────────────────────────────────

function PangiIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">
      <path d="M50 88C40 87 22 80 14 68C7 56 8 40 16 30L10 6L28 20C36 17 44 15 50 15C56 15 64 17 72 20L90 6L84 30C92 40 93 56 86 68C78 80 60 87 50 88Z"/>
    </svg>
  );
}

// ── Invite Icon ───────────────────────────────────────────────

function IconInvitar() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="6.5" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M1 13.5c0-3 2.5-5 5.5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M12 9v6M9 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────

export default function Topbar() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [rol, setRol]       = useState("");
  const [plantaId, setPlantaId] = useState(null);

  // invite modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    nombre: "", email: "", password: "", rol: "tecnico",
  });
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError]   = useState(null);
  const [inviteOk, setInviteOk]         = useState(null); // success message

  useEffect(() => {
    async function cargarUsuario() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase
        .from("usuarios")
        .select("nombre, rol, planta_id")
        .eq("id", user.id)
        .maybeSingle();
      if (perfil?.nombre)    setNombre(perfil.nombre);
      if (perfil?.rol)       setRol(perfil.rol);
      if (perfil?.planta_id) setPlantaId(perfil.planta_id);
    }
    cargarUsuario();
  }, []);

  function setField(field, value) {
    setInviteForm((f) => ({ ...f, [field]: value }));
  }

  function abrirInvite() {
    setInviteForm({ nombre: "", email: "", password: "", rol: "tecnico" });
    setInviteError(null);
    setInviteOk(null);
    setInviteOpen(true);
  }

  async function enviarInvitacion() {
    if (!inviteForm.nombre.trim()) { setInviteError("Ingresa el nombre."); return; }
    if (!inviteForm.email.trim())  { setInviteError("Ingresa el email."); return; }
    if (!inviteForm.password.trim() || inviteForm.password.length < 8) {
      setInviteError("La contraseña debe tener al menos 8 caracteres."); return;
    }
    setInviteError(null);
    setInviteSaving(true);

    const res = await fetch("/api/invitar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre:    inviteForm.nombre.trim(),
        email:     inviteForm.email.trim(),
        password:  inviteForm.password,
        rol:       inviteForm.rol,
        planta_id: plantaId,
      }),
    });

    const body = await res.json();
    setInviteSaving(false);

    if (!res.ok) {
      setInviteError(body.error ?? "Error al crear el usuario.");
      return;
    }

    setInviteOk({
      nombre:   inviteForm.nombre.trim(),
      email:    inviteForm.email.trim(),
      password: inviteForm.password,
    });
  }

  return (
    <>
      <header className={styles.topbar}>
        <button
          className={styles.logoBtn}
          onClick={() => { if (rol) router.push(rol === "jefe" ? "/jefe" : "/tecnico"); }}
          aria-label="Ir al inicio"
        >
          <PangiIcon className={styles.logoImg} />
          <span className={styles.logoText}>Pangi</span>
        </button>

        <div className={styles.right}>
          {rol === "jefe" && (
            <button className={styles.btnInvitar} onClick={abrirInvite}>
              <IconInvitar />
              Invitar
            </button>
          )}
          {nombre && <span className={styles.userName}>{nombre}</span>}
        </div>
      </header>

      {/* ── Invite modal ── */}
      {inviteOpen && (
        <div className={styles.overlay} onClick={() => setInviteOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            {inviteOk ? (
              /* Success screen */
              <div className={styles.modalSuccess}>
                <p className={styles.modalSuccessTitle}>¡Usuario creado!</p>
                <p className={styles.modalSuccessInfo}>
                  Comparte estas credenciales con <strong>{inviteOk.nombre}</strong>:
                </p>
                <div className={styles.credBox}>
                  <div className={styles.credRow}>
                    <span className={styles.credLabel}>Email</span>
                    <span className={styles.credVal}>{inviteOk.email}</span>
                  </div>
                  <div className={styles.credRow}>
                    <span className={styles.credLabel}>Contraseña</span>
                    <span className={styles.credVal}>{inviteOk.password}</span>
                  </div>
                </div>
                <button
                  className={styles.btnPrimary}
                  onClick={() => setInviteOpen(false)}
                >
                  Listo
                </button>
              </div>
            ) : (
              /* Form */
              <>
                <h2 className={styles.modalTitle}>Invitar miembro</h2>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Nombre completo</label>
                  <input
                    className={styles.formInput}
                    type="text"
                    placeholder="Ej. Juan Pérez"
                    value={inviteForm.nombre}
                    onChange={(e) => setField("nombre", e.target.value)}
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Email</label>
                  <input
                    className={styles.formInput}
                    type="email"
                    placeholder="usuario@empresa.cl"
                    value={inviteForm.email}
                    onChange={(e) => setField("email", e.target.value)}
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Contraseña temporal</label>
                  <input
                    className={styles.formInput}
                    type="text"
                    placeholder="Mínimo 8 caracteres"
                    value={inviteForm.password}
                    onChange={(e) => setField("password", e.target.value)}
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Rol</label>
                  <select
                    className={styles.formSelect}
                    value={inviteForm.rol}
                    onChange={(e) => setField("rol", e.target.value)}
                  >
                    <option value="tecnico">Técnico</option>
                    <option value="jefe">Jefe de mantención</option>
                  </select>
                </div>

                {inviteError && <p className={styles.formError}>{inviteError}</p>}

                <div className={styles.modalActions}>
                  <button
                    className={styles.btnGhost}
                    onClick={() => setInviteOpen(false)}
                    disabled={inviteSaving}
                  >
                    Cancelar
                  </button>
                  <button
                    className={styles.btnPrimary}
                    onClick={enviarInvitacion}
                    disabled={inviteSaving}
                  >
                    {inviteSaving ? "Creando…" : "Invitar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
