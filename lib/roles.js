export const ROL_LABEL = {
  admin:   "Administrador",
  jefe:    "Usuario",
  tecnico: "Usuario limitado",
};

export const ROL_DESCRIPTION = {
  admin:   "Acceso completo a todo el sistema",
  jefe:    "Acceso completo, no puede eliminar usuarios",
  tecnico: "Acceso limitado por permisos asignados",
};

export function esAdmin(rol) {
  return rol === "admin";
}

export function esElevado(rol) {
  return rol === "admin" || rol === "jefe";
}
