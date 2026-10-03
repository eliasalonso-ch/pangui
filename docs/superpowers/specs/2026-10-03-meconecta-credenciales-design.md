# MeConecta: credenciales del contratista + página de Integraciones

Fecha: 2026-10-03 · Rama: `feat/meconecta-credenciales`

## Problema

El scraper de MeConecta (portal de mantención UdeC) inicia sesión con la cuenta de
Electrilam usando los secrets de Edge Functions `MECONECTA_EMAIL` /
`MECONECTA_PASSWORD`. Esa clave la conoce el equipo de Pangui. Si la UdeC/Electrilam
lo ve, es un problema: la credencial debe ser del contratista, ingresada y revocada
por él, cifrada, y desconocida para el equipo.

## Hechos verificados (2026-10-03)

- La clave **nunca** se commiteó: el historial de git solo tiene `Deno.env.get(...)`.
  Ningún `.env*` local la contiene. Solo vive en los secrets de Edge Functions.
- Vault ya está activo y en uso (`meconecta_cron_url`, `service_role_key`).
- Job `meconecta-scrape-tick`: cada 15 min, efectivo lun–sáb 07:00–18:00
  America/Santiago (≈44 logins/día).
- `public.my_workspace_id()` y `public.my_rol()` existen (security definer).
- `login()` lanza un `Error` genérico tanto si el portal está caído como si la
  clave es incorrecta; hoy no se pueden distinguir.

## Decisiones

| Tema | Decisión |
|---|---|
| Alcance | Solo Electrilam, `workspace_id` hardcodeado (como hoy). |
| Transición | Sin fallback a env. Desde el deploy, solo Vault; el cron se pausa hasta que Electrilam conecte. |
| Permiso | Owner + admin de Electrilam (`esAdmin`). |
| UI | Nueva página **Integraciones** en el grupo Cuenta del sidebar, solo Electrilam owner/admin. Catálogo + página de detalle estilo MaintainX. |
| Logo UdeC | Placeholder (monograma "UdeC") hasta tener el logo real. |

## 1. Datos y seguridad (una migración vía `apply_migration`)

### Tabla `public.integration_connections`

| columna | tipo | notas |
|---|---|---|
| `id` | uuid pk default `gen_random_uuid()` | |
| `workspace_id` | uuid not null → `workspaces(id)` on delete cascade | |
| `provider` | text not null, check in (`'meconecta'`) | |
| `username` | text not null | se muestra en la UI |
| `secret_id` | uuid not null | puntero a `vault.secrets.id` |
| `status` | text not null default `'pendiente'`, check in (`pendiente`,`conectado`,`credenciales_invalidas`,`error`) | |
| `last_sync_at` | timestamptz | último login + lectura exitosos |
| `last_error` | text | último error (sin datos sensibles) |
| `authorized_by` | uuid → `usuarios(id)` on delete set null | registro de consentimiento |
| `authorized_at` | timestamptz not null | |
| `created_at`, `updated_at` | timestamptz | |

- `unique (workspace_id, provider)`.
- RLS activado. **Una** política `select` para `authenticated`:
  `workspace_id = my_workspace_id() and my_rol() in ('owner','admin')`.
  Sin políticas de insert/update/delete: toda escritura de usuario pasa por RPC;
  las Edge Functions escriben con service_role.
- `secret_id` es legible por admins pero inútil: no tienen acceso a `vault`.

### RPCs

Todas `security definer set search_path = ''`, workspace derivado de
`my_workspace_id()` (nunca parámetro), y exigen workspace = Electrilam y
`my_rol() in ('owner','admin')`.

- `set_meconecta_credentials(p_usuario text, p_clave text, p_autoriza boolean)`
  - Rechaza si `p_autoriza` no es `true`, o usuario/clave vacíos.
  - Si no hay fila: `vault.create_secret(p_clave, 'meconecta_<ws>')` + insert.
  - Si hay: `vault.update_secret(secret_id, p_clave)` + update de username.
  - En ambos: `status='pendiente'`, `last_error=null`, `authorized_by=auth.uid()`,
    `authorized_at=now()`.
  - `grant execute` solo a `authenticated`.
- `disconnect_meconecta()`
  - Borra el secreto de `vault.secrets` y la fila.
  - `grant execute` solo a `authenticated`.
- `get_meconecta_credentials()` → `(username text, password text, status text)`
  - Lee `vault.decrypted_secrets` para la fila de Electrilam.
  - `revoke all from public, anon, authenticated`; `grant execute to service_role`.

La clave viaja una sola vez: navegador → PostgREST → Vault. Nunca vuelve al
frontend ni pasa por Vercel.

## 2. Edge Functions

- `_shared/meconecta-scrape.ts`
  - Nueva clase `MeconectaAuthError`. `login()` la lanza cuando el portal responde
    pero rechaza las credenciales (se confirma la forma de esa respuesta con un
    intento de login con un email inventado; no bloquea ninguna cuenta real).
    `fetchOrders()` la lanza si rebota al login.
  - Nuevo `getCredentials(supabase)`: llama a `get_meconecta_credentials`; devuelve
    `null` si no hay conexión o el status es `credenciales_invalidas`.
  - Nuevo `markStatus(supabase, patch)`: actualiza la fila (status / last_sync_at /
    last_error).
- `meconecta-scrape-cron`
  - Sin credenciales utilizables → responde `{ skipped: "sin conexión" }`, sin lanzar
    (no dispara la alerta de cron de Sentry cada 15 min).
  - `MeconectaAuthError` → `status='credenciales_invalidas'`, `last_error`, y **una**
    notificación a owners/admins de Electrilam ("MeConecta rechazó la clave —
    vuelve a conectarla", url `/integraciones/meconecta`). Deja de intentar.
  - Éxito → `status='conectado'`, `last_sync_at=now()`, `last_error=null`.
  - Otro error → `last_error`, status sin cambio; se relanza (Sentry) y reintenta
    en el próximo tick.
- `meconecta-check`
  - Mismo manejo de credenciales/estado.
  - Sin conexión → `{ ok:false, code:"sin_conexion" }` (409).
  - Nuevo modo `{ soloProbar: true }`: login + fetch, actualiza status, devuelve
    `{ ok, status, total }` sin reconciliar. Usa también las credenciales en estado
    `credenciales_invalidas` (es el reintento explícito del usuario).
- Se eliminan las lecturas de `MECONECTA_EMAIL` / `MECONECTA_PASSWORD`.

## 3. Web

### Navegación
- `components/AppSidebar.tsx`: ítem "Integraciones" (ícono `Plug`) en Cuenta, bajo
  Espacio de trabajo; visible si `isAdmin && workspace === ELECTRILAM`.
- `GlobalTopBar`: breadcrumb `["Cuenta","Integraciones"]`.
- Las páginas validan el mismo gate (URL directa → redirect/"No disponible").

### `lib/integraciones.ts`
Lista estática de integraciones (slug, nombre, descripción corta, logo, href). Hoy
una sola entrada: `meconecta`.

### `/integraciones` (catálogo)
- Título "Integraciones" + subtítulo.
- Sección "Conectores": grid de tarjetas. Tarjeta MeConecta: caja de logo
  (placeholder "UdeC"), nombre "MeConecta · UdeC", descripción, badge de estado
  (Conectado / Sin conectar / Clave rechazada / Error), botón Conectar o
  Administrar → detalle.
- Tarjeta "¿No encuentras lo que buscas?" → "Solicitar integración"
  (`mailto:contacto@getpangui.com`).
- Sin el banner orbital: con una sola integración real sugeriría integraciones
  que no existen.

### `/integraciones/meconecta` (detalle)
- Breadcrumb Integraciones › MeConecta. Encabezado "[UdeC] + [Pangui]" y título
  "MeConecta y Pangui".
- Columna izquierda:
  - **Resumen**.
  - **Qué hace**: aviso de solicitudes nuevas; "Revisar MeConecta" (faltantes /
    huérfanas); solo lectura, nunca escribe en MeConecta.
  - **Cómo funciona**: 1) conecta tu cuenta MeConecta, 2) Pangui revisa cada 15 min
    en horario hábil (lun–sáb 07:00–18:00), 3) cruce por folio en N° de Serie.
  - **Preguntas frecuentes** (acordeón): qué datos se leen (fecha, folio, estado,
    ID; ningún dato personal); dónde se guarda la clave (cifrada en Vault, no se
    vuelve a mostrar, nadie del equipo la conoce); qué pasa si cambio la clave en
    MeConecta (queda "Clave rechazada" y Pangui deja de intentar); cómo
    desconectar; dónde se almacenan los datos (Supabase, EE.UU.).
- Sidebar derecho (sticky):
  - Panel de conexión: estado, "Conectado como x@…", última sincronización,
    último error.
  - **Conectar** / **Cambiar clave** → diálogo: usuario, clave, checkbox
    "Autorizo a Pangui a sincronizar mis solicitudes de MeConecta", botón
    **Guardar y probar** (RPC → `/api/meconecta/probar`).
  - **Probar conexión** → `/api/meconecta/probar`.
  - **Desconectar** (con confirmación) → RPC `disconnect_meconecta`.
  - "Gestionado por: Pangui"; enlaces Contacto y Abrir MeConecta.
- Tokens de color del proyecto y modo oscuro.

### `/api/meconecta/probar`
Mismo auth / gate Electrilam / `esAdmin` / cooldown que `/api/meconecta/check`;
invoca `meconecta-check` con `{ soloProbar: true }`.

### Revisar MeConecta (Órdenes)
`MeconectaCheck.tsx`: si la respuesta es `sin_conexion`, muestra "Conecta MeConecta
en Integraciones" con enlace a `/integraciones/meconecta`.

## 4. Cutover (lo ejecuta Elías; nada se despliega solo)

1. Aplicar la migración (MCP `apply_migration`, nunca `db push`) y desplegar
   `meconecta-scrape-cron` + `meconecta-check`. Desde aquí el cron queda en pausa.
2. Desplegar la web.
3. Electrilam cambia su clave en MeConecta y la ingresa en Pangui (mismo día).
4. `supabase secrets unset MECONECTA_EMAIL MECONECTA_PASSWORD`.

## Pruebas

- SQL (como roles simulados): member, usuario de otro workspace y `anon` fallan en
  `set_` y `disconnect_`; `authenticated` no puede ejecutar
  `get_meconecta_credentials`; owner/admin de Electrilam sí puede guardar y la fila
  queda `pendiente`; `p_autoriza=false` rechaza.
- `tsc` + lint de la web.
- Manual: estados de la tarjeta y del panel (sin conectar, pendiente, conectado,
  clave rechazada, error), gate de sidebar y URL directa para no-Electrilam.

## Fuera de alcance

- Abrir la integración a otros workspaces.
- La API oficial con TI de la UdeC (documento aparte).
- Corregir el corrimiento UTC de `fecha` en `uni_solicitudes_vistas`.
