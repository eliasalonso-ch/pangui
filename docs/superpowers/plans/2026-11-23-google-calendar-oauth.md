# Pendientes → Google Calendar con OAuth (etapa 2)

Etapa 1, ya en producción: feed `.ics` por workspace (`calendario_feeds` + edge
function `pendientes-ics`, botón «Calendario del equipo» en /pendientes, solo
owner/admin). Limitaciones: es de solo lectura, Google lo actualiza cada varias
horas y cada persona tiene que suscribirse con el link.

Etapa 2: un admin conecta una cuenta de Google y elige un calendario existente,
por ejemplo el del equipo. Desde ahí pangui crea, mueve y borra los eventos al
instante. Sirve para cualquier workspace y no necesita Google Workspace: funciona
igual con Gmail.

## 1. Trámite en Google (lo hace Elías, en paralelo)

1. **Proyecto en Google Cloud** «Pangui», con la Google Calendar API habilitada.
2. **Pantalla de consentimiento OAuth**, tipo *External*:
   - nombre «Pangui», logo, correo de soporte;
   - dominio autorizado `getpangui.com` (verificado en Search Console);
   - home `https://getpangui.com`, privacidad `https://getpangui.com/privacidad`, términos `/terminos`.
3. **Permisos (scopes)**:
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`: listar los calendarios para elegir uno.
   - `https://www.googleapis.com/auth/calendar.events`: escribir eventos en el calendario elegido.
   - Antes de enviar, confirmar en la consola si alcanzan los scopes granulares más nuevos (`calendar.events.owned` o similares). Los de Calendar son **sensibles** (no restringidos), así que no exigen auditoría de seguridad pagada.
4. **Cliente OAuth** tipo *Web*. Redirect URI: `https://app.getpangui.com/api/google/callback`, más el de localhost para desarrollo.
5. **Enviar a verificación**: explicar el uso de cada permiso y subir un **video en YouTube** (no listado) que muestre el flujo de conexión y el evento apareciendo en el calendario. Suele tomar de días a algunas semanas.
6. **Mientras no esté verificada**: estado *Testing*, con un máximo de 100 usuarios de prueba agregados a mano. **El refresh token vence a los 7 días**, así que sirve para probar con Electrilam, no para producción.

Secretos en Supabase (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) y en Vercel (los mismos).

## 2. Modelo de datos

```sql
create table public.calendario_google (
  workspace_id  uuid primary key references workspaces(id) on delete cascade,
  conectado_por uuid references usuarios(id) on delete set null,
  google_email  text not null,           -- para mostrar «Conectado como …»
  calendar_id   text,                    -- null hasta que elija uno
  calendar_nombre text,
  secret_id     uuid not null,           -- refresh token en Vault (como MeConecta)
  estado        text not null default 'activo' check (estado in ('activo','revocado','error')),
  ultimo_error  text,
  created_at    timestamptz not null default now()
);
-- RLS: solo owner/admin del workspace (igual que calendario_feeds).

alter table public.ot_pendientes
  add column gcal_event_id    text,            -- id del evento en Google
  add column gcal_sync        text not null default 'pendiente'
             check (gcal_sync in ('pendiente','ok','error')),
  add column gcal_intentos    smallint not null default 0;
```

Los tokens **nunca** van en una columna en texto plano: el refresh token se
guarda en Vault y la tabla solo tiene `secret_id`, igual que
`set_meconecta_credentials`.

## 3. Flujo de conexión

1. Integraciones → tarjeta «Google Calendar» (solo owner/admin). Este es el
   momento de abrir Integraciones a todos los workspaces: hoy `puedeVerIntegraciones`
   está fijo a Electrilam y la UdeC; la tarjeta de MeConecta debe quedar con ese gate.
2. «Conectar» → `/api/google/auth`: arma la URL de Google con `access_type=offline`,
   `prompt=consent` y un `state` firmado (workspace + usuario + nonce, HMAC).
3. `/api/google/callback`: valida el `state`, cambia el `code` por tokens, guarda
   el refresh token en Vault y crea la fila en `calendario_google`.
4. Elegir el calendario: lista `calendarList` y muestra solo los que tienen
   `accessRole` `writer` u `owner`. Se guarda `calendar_id`.
5. «Desconectar»: revoca el token en Google, borra el secreto y la fila, y deja
   en `pendiente` los `gcal_*` de los pendientes. Los eventos ya creados se quedan;
   ofrecer «Borrar los eventos de Pangui».

## 4. Sincronización (pangui → Google, un sentido)

- **Encolar:** un trigger en `ot_pendientes` pone `gcal_sync = 'pendiente'` cuando
  cambian nota, fecha, hora, estado, prioridad o se borra la fila. Un borrado no
  puede quedar en la misma fila, así que el trigger `after delete` inserta
  `(workspace_id, gcal_event_id)` en una tabla `gcal_borrados`.
- **Procesar:** la edge function `gcal-sync` corre por cron cada minuto. Para cada
  workspace con conexión activa:
  1. Pide un access token con el refresh token.
  2. Abierto sin evento → `events.insert` y guarda `gcal_event_id`.
  3. Abierto con evento → `events.patch`.
  4. Hecho o cancelado → `events.delete` (o un patch con «✓», si se decide así).
  5. Recorre `gcal_borrados` → `events.delete`.
  6. Si funcionó → `ok`. Si falló → `error`, con reintento exponencial por `gcal_intentos`; desde 5 intentos queda en `error` y se ve en la UI.
- **Formato del evento:** el mismo que el feed (`_shared/ics-pendientes.ts`):
  título «nota — Nombre», descripción con la OT, el estado, la prioridad y el link;
  todo el día si no tiene hora, y 30 min si tiene. Agregar
  `extendedProperties.private.pangui_pendiente_id` para reconciliar.
- **Token revocado** (`invalid_grant`): `estado = 'revocado'`, se detiene la sync
  y se notifica al owner/admin («Reconecta Google Calendar»).
- **Cuotas:** la Calendar API permite de sobra el volumen esperado; usar lotes de
  50 por tick y respetar `429` con backoff.

## 5. Fuera de alcance

- Sincronizar de Google hacia pangui: si alguien mueve el evento en Google, pangui no se entera.
- Un calendario por persona o por cuadrilla: el modelo deja una conexión por workspace;
  después se puede extender a `(workspace_id, usuario_id)`.
- Outlook / Microsoft 365: mismo diseño con Microsoft Graph; para ellos sigue el feed `.ics`.

## 6. Orden de trabajo

1. Trámite de Google (§1) — Elías, en paralelo.
2. Migración (§2) y Vault.
3. Rutas OAuth y tarjeta en Integraciones (§3), abriendo Integraciones a todos los admins.
4. `gcal-sync` y los triggers (§4), con pruebas del armado del evento (reutiliza `ics-pendientes`).
5. Probar con Electrilam como usuario de prueba y, cuando Google apruebe, abrirlo a todos.
