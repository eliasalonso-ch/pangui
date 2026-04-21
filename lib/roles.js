export const ROL_LABEL = {
  owner:     "Propietario",
  admin:     "Administrador",
  member:    "Miembro",
  requester: "Solicitante",
  // legacy aliases kept for any existing data
  jefe:    "Miembro",
  tecnico: "Miembro",
};

export const ROL_DESCRIPTION = {
  owner:     "Acceso total, puede eliminar administradores",
  admin:     "Acceso completo al sistema",
  member:    "Acceso estándar",
  requester: "Solo puede crear y ver sus solicitudes",
};

export function esOwner(rol) {
  return rol === "owner";
}

export function esAdmin(rol) {
  return rol === "admin" || rol === "owner";
}

export function esElevado(rol) {
  return rol === "owner" || rol === "admin" || rol === "member" || rol === "jefe";
}
