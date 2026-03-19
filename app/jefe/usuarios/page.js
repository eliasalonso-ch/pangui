"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, UserPlus, MoreVertical, UserCheck, UserX, Trash2, Shield, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { callEdge } from "@/lib/edge";
import styles from "./page.module.css";

const ROL_LABEL = { jefe: "Jefe de mantención", tecnico: "Técnico" };
const ROL_ICON  = { jefe: Shield, tecnico: Wrench };

export default function UsuariosPage() {
  const router = useRouter();
  const [usuarios, setUsuarios]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [myId,     setMyId]       = useState(null);
  const [plantaId, setPlantaId]   = useState(null);

  // Invite form
  const [inviteOpen,   setInviteOpen]   = useState(false);
  const [inviteForm,   setInviteForm]   = useState({ nombre: "", email: "", password: "", rol: "tecnico" });
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError,  setInviteError]  = useState(null);
  const [inviteOk,     setInviteOk]     = useState(null);

  // Context menu
  const [menuOpen, setMenuOpen] = useState(null); // user id

  // Confirm dialog
  const [confirm, setConfirm] = useState(null); // { tipo, usuario }

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setMyId(user.id);

      const { data: perfil } = await supabase
        .from("usuarios")
        .select("planta_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!perfil?.planta_id) return;
      setPlantaId(perfil.planta_id);
      await fetchUsuarios(supabase, perfil.planta_id);
    }
    load();
  }, []);

  async function fetchUsuarios(supabase, pid) {
    setLoading(true);
    const { data } = await supabase
      .from("usuarios")
      .select("id, nombre, rol, activo")
      .eq("planta_id", pid)
      .order("nombre");
    setUsuarios(data ?? []);
    setLoading(false);
  }

  async function reload() {
    const supabase = createClient();
    await fetchUsuarios(supabase, plantaId);
  }

  // ── Invite ───────────────────────────────────────────────────
  function openInvite() {
    setInviteForm({ nombre: "", email: "", password: "", rol: "tecnico" });
    setInviteError(null);
    setInviteOk(null);
    setInviteOpen(true);
  }

  async function enviarInvitacion() {
    if (!inviteForm.nombre.trim()) { setInviteError("Ingresa el nombre."); return; }
    if (!inviteForm.email.trim())  { setInviteError("Ingresa el email."); return; }
    if (!inviteForm.password || inviteForm.password.length < 8) {
      setInviteError("La contraseña debe tener al menos 8 caracteres."); return;
    }
    setInviteError(null);
    setInviteSaving(true);

    const res  = await callEdge("invitar", {
      nombre:    inviteForm.nombre.trim(),
      email:     inviteForm.email.trim(),
      password:  inviteForm.password,
      rol:       inviteForm.rol,
      planta_id: plantaId,
    });
    const body = await res.json();
    setInviteSaving(false);

    if (!res.ok) { setInviteError(body.error ?? "Error al crear el usuario."); return; }
    setInviteOk({ nombre: inviteForm.nombre.trim(), email: inviteForm.email.trim(), password: inviteForm.password });
    reload();
  }

  // ── Toggle activo ────────────────────────────────────────────
  async function toggleActivo(usuario) {
    const newVal = !(usuario.activo ?? true);
    const res = await fetch(`/api/usuarios/${usuario.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: newVal }),
    });
    if (res.ok) {
      setUsuarios((prev) =>
        prev.map((u) => u.id === usuario.id ? { ...u, activo: newVal } : u)
      );
    }
    setConfirm(null);
    setMenuOpen(null);
  }

  // ── Delete ───────────────────────────────────────────────────
  async function eliminarUsuario(usuario) {
    const res = await fetch(`/api/usuarios/${usuario.id}`, { method: "DELETE" });
    if (res.ok) {
      setUsuarios((prev) => prev.filter((u) => u.id !== usuario.id));
    }
    setConfirm(null);
    setMenuOpen(null);
  }

  // ── Change rol ───────────────────────────────────────────────
  async function cambiarRol(usuario, rol) {
    const res = await fetch(`/api/usuarios/${usuario.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rol }),
    });
    if (res.ok) {
      setUsuarios((prev) =>
        prev.map((u) => u.id === usuario.id ? { ...u, rol } : u)
      );
    }
    setMenuOpen(null);
  }

  const activos   = usuarios.filter((u) => u.activo !== false);
  const inactivos = usuarios.filter((u) => u.activo === false);

  return (
    <main className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <ArrowLeft size={20} />
        </button>
        <h1 className={styles.title}>Equipo</h1>
        <button className={styles.addBtn} onClick={openInvite}>
          <UserPlus size={18} />
          <span>Agregar</span>
        </button>
      </div>

      {loading ? (
        <div className={styles.empty}>Cargando equipo…</div>
      ) : (
        <>
          {/* Active users */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Activos · {activos.length}</h2>
            <div className={styles.list}>
              {activos.map((u) => (
                <UserCard
                  key={u.id}
                  usuario={u}
                  isMe={u.id === myId}
                  menuOpen={menuOpen === u.id}
                  onMenu={() => setMenuOpen(menuOpen === u.id ? null : u.id)}
                  onMenuClose={() => setMenuOpen(null)}
                  onToggleActivo={() => setConfirm({ tipo: "desactivar", usuario: u })}
                  onEliminar={() => setConfirm({ tipo: "eliminar", usuario: u })}
                  onCambiarRol={(rol) => cambiarRol(u, rol)}
                />
              ))}
              {activos.length === 0 && (
                <p className={styles.emptyList}>Sin usuarios activos</p>
              )}
            </div>
          </section>

          {/* Inactive users */}
          {inactivos.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Inactivos · {inactivos.length}</h2>
              <div className={styles.list}>
                {inactivos.map((u) => (
                  <UserCard
                    key={u.id}
                    usuario={u}
                    isMe={false}
                    menuOpen={menuOpen === u.id}
                    onMenu={() => setMenuOpen(menuOpen === u.id ? null : u.id)}
                    onMenuClose={() => setMenuOpen(null)}
                    onToggleActivo={() => setConfirm({ tipo: "activar", usuario: u })}
                    onEliminar={() => setConfirm({ tipo: "eliminar", usuario: u })}
                    onCambiarRol={(rol) => cambiarRol(u, rol)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Invite modal */}
      {inviteOpen && (
        <div className={styles.overlay} onClick={() => setInviteOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            {inviteOk ? (
              <div className={styles.successBox}>
                <p className={styles.successTitle}>¡Usuario creado!</p>
                <p className={styles.successSub}>
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
                <button className={styles.btnPrimary} onClick={() => setInviteOpen(false)}>
                  Listo
                </button>
              </div>
            ) : (
              <>
                <h2 className={styles.modalTitle}>Agregar miembro</h2>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Nombre completo</label>
                  <input
                    className={styles.formInput}
                    type="text"
                    placeholder="Ej. Juan Pérez"
                    value={inviteForm.nombre}
                    onChange={(e) => setInviteForm((f) => ({ ...f, nombre: e.target.value }))}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Email</label>
                  <input
                    className={styles.formInput}
                    type="email"
                    placeholder="usuario@empresa.cl"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Contraseña temporal</label>
                  <input
                    className={styles.formInput}
                    type="text"
                    placeholder="Mínimo 8 caracteres"
                    value={inviteForm.password}
                    onChange={(e) => setInviteForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Rol</label>
                  <select
                    className={styles.formSelect}
                    value={inviteForm.rol}
                    onChange={(e) => setInviteForm((f) => ({ ...f, rol: e.target.value }))}
                  >
                    <option value="tecnico">Técnico</option>
                    <option value="jefe">Jefe de mantención</option>
                  </select>
                </div>

                {inviteError && <p className={styles.formError}>{inviteError}</p>}

                <div className={styles.modalActions}>
                  <button className={styles.btnGhost} onClick={() => setInviteOpen(false)} disabled={inviteSaving}>
                    Cancelar
                  </button>
                  <button className={styles.btnPrimary} onClick={enviarInvitacion} disabled={inviteSaving}>
                    {inviteSaving ? "Creando…" : "Agregar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirm && (
        <div className={styles.overlay} onClick={() => setConfirm(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            {confirm.tipo === "eliminar" ? (
              <>
                <p className={styles.confirmTitle}>¿Eliminar usuario?</p>
                <p className={styles.confirmSub}>
                  Se eliminará permanentemente la cuenta de <strong>{confirm.usuario.nombre}</strong>. Esta acción no se puede deshacer.
                </p>
                <div className={styles.modalActions}>
                  <button className={styles.btnGhost} onClick={() => setConfirm(null)}>Cancelar</button>
                  <button className={styles.btnDanger} onClick={() => eliminarUsuario(confirm.usuario)}>Eliminar</button>
                </div>
              </>
            ) : confirm.tipo === "desactivar" ? (
              <>
                <p className={styles.confirmTitle}>¿Desactivar usuario?</p>
                <p className={styles.confirmSub}>
                  <strong>{confirm.usuario.nombre}</strong> no podrá iniciar sesión hasta que lo reactives.
                </p>
                <div className={styles.modalActions}>
                  <button className={styles.btnGhost} onClick={() => setConfirm(null)}>Cancelar</button>
                  <button className={styles.btnDanger} onClick={() => toggleActivo(confirm.usuario)}>Desactivar</button>
                </div>
              </>
            ) : (
              <>
                <p className={styles.confirmTitle}>¿Activar usuario?</p>
                <p className={styles.confirmSub}>
                  <strong>{confirm.usuario.nombre}</strong> podrá volver a iniciar sesión.
                </p>
                <div className={styles.modalActions}>
                  <button className={styles.btnGhost} onClick={() => setConfirm(null)}>Cancelar</button>
                  <button className={styles.btnPrimary} onClick={() => toggleActivo(confirm.usuario)}>Activar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function UserCard({ usuario, isMe, menuOpen, onMenu, onMenuClose, onToggleActivo, onEliminar, onCambiarRol }) {
  const isActive = usuario.activo !== false;
  const RolIcon  = ROL_ICON[usuario.rol] ?? Wrench;

  return (
    <div className={`${styles.card} ${!isActive ? styles.cardInactive : ""}`}>
      <div className={styles.avatar}>
        {usuario.nombre?.[0]?.toUpperCase() ?? "?"}
      </div>
      <div className={styles.info}>
        <span className={styles.name}>
          {usuario.nombre}
          {isMe && <span className={styles.meBadge}>Tú</span>}
        </span>
        <span className={styles.rol}>
          <RolIcon size={11} />
          {ROL_LABEL[usuario.rol] ?? usuario.rol}
        </span>
      </div>
      <div className={styles.cardRight}>
        {!isActive && <span className={styles.inactivoBadge}>Inactivo</span>}
        {!isMe && (
          <div className={styles.menuWrap}>
            <button className={styles.menuBtn} onClick={onMenu}>
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <>
                <div className={styles.menuBackdrop} onClick={onMenuClose} />
                <div className={styles.menu}>
                  {/* Toggle activo */}
                  <button className={styles.menuItem} onClick={onToggleActivo}>
                    {isActive ? (
                      <><UserX size={14} /> Desactivar</>
                    ) : (
                      <><UserCheck size={14} /> Activar</>
                    )}
                  </button>

                  {/* Change rol */}
                  {usuario.rol === "tecnico" ? (
                    <button className={styles.menuItem} onClick={() => onCambiarRol("jefe")}>
                      <Shield size={14} /> Hacer jefe
                    </button>
                  ) : (
                    <button className={styles.menuItem} onClick={() => onCambiarRol("tecnico")}>
                      <Wrench size={14} /> Hacer técnico
                    </button>
                  )}

                  <div className={styles.menuDivider} />

                  <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={onEliminar}>
                    <Trash2 size={14} /> Eliminar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
