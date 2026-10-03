# MeConecta: credenciales del contratista — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the MeConecta portal credentials out of Edge Function env secrets into Vault, entered and revoked by Electrilam from a new Integraciones page.

**Architecture:** A `integration_connections` table points at a Vault secret. Electrilam owners/admins write it only through two security-definer RPCs; the Edge Functions read it through a third RPC granted only to `service_role`. The scraper learns to tell "wrong password" (`login_status: "invalid"`) apart from "portal down", and stops on the former. The web gets `/integraciones` (catalog) and `/integraciones/meconecta` (detail + connection panel).

**Tech Stack:** Postgres + Supabase Vault, Deno Edge Functions, Next.js 16 app router, React client components with inline token styles, vitest.

**Spec:** `docs/superpowers/specs/2026-10-03-meconecta-credenciales-design.md`

## Global Constraints

- Electrilam only: workspace `f1b64714-6de2-4d49-b6e4-5959553e94d7`, hardcoded (SQL and Edge); web uses `ELECTRILAM_WORKSPACE_ID` from `@/lib/itos-gate`.
- Permission: owner + admin (`esAdmin` on web, `my_rol() in ('owner','admin')` in SQL).
- No env fallback: `MECONECTA_EMAIL` / `MECONECTA_PASSWORD` must not be read anywhere after this change.
- The password never returns to the frontend and never passes through the Next server.
- Never `supabase db push`; the migration is applied with MCP `apply_migration` by Elías at cutover. Nothing is deployed by the implementer.
- UI copy in Spanish (Chile). Styling: inline styles with tokens (`--fg-1..4`, `--surface-0..2`, `--border`, `--brand`, `--brand-tint`, `--success(-bg)`, `--danger(-bg)`, `--st-wait-bg/fg`, `--r-md`, `--r-lg`), font weights 400/500.
- Portal facts: a rejected login answers HTTP 200, sets a PHPSESSID, and returns `{"login_status":"invalid",...}`.

---

### Task 1: Migration — table, RPCs, pgTAP test

**Files:**
- Create: `supabase/migrations/20261003120000_meconecta_credenciales.sql`
- Create: `supabase/tests/meconecta_credenciales.test.sql`

**Interfaces:**
- Produces: table `public.integration_connections`; RPCs `set_meconecta_credentials(p_usuario text, p_clave text, p_autoriza boolean) returns void`, `disconnect_meconecta() returns void` (authenticated), `get_meconecta_credentials() returns table(username text, password text, status text, authorized_at timestamptz)` (service_role only).

- [ ] **Step 1: Write the pgTAP test** (`supabase/tests/meconecta_credenciales.test.sql`)

```sql
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(9);

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mc-admin@test.local', '', now(), now(), now()),
       ('10000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mc-member@test.local', '', now(), now(), now()),
       ('10000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mc-otro@test.local', '', now(), now(), now());
SET LOCAL session_replication_role = origin;

INSERT INTO public.workspaces (id, nombre)
VALUES ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Electrilam test'),
       ('20000000-0000-0000-0000-0000000000c9', 'Otro WS')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, nombre, rol, workspace_id, activo)
VALUES ('10000000-0000-0000-0000-0000000000c1', 'Admin', 'admin',  'f1b64714-6de2-4d49-b6e4-5959553e94d7', true),
       ('10000000-0000-0000-0000-0000000000c2', 'Member', 'member', 'f1b64714-6de2-4d49-b6e4-5959553e94d7', true),
       ('10000000-0000-0000-0000-0000000000c3', 'Otro', 'owner',   '20000000-0000-0000-0000-0000000000c9', true);

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

-- member: rechazado
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000c2', true);
SELECT throws_ok($$ SELECT public.set_meconecta_credentials('u@x.cl', 'clave', true) $$, '42501', NULL, 'member no puede guardar');

-- owner de otro workspace: rechazado
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000c3', true);
SELECT throws_ok($$ SELECT public.set_meconecta_credentials('u@x.cl', 'clave', true) $$, '42501', NULL, 'otro workspace no puede guardar');

-- admin Electrilam
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000c1', true);
SELECT throws_ok($$ SELECT public.set_meconecta_credentials('u@x.cl', 'clave', false) $$, '22023', NULL, 'sin autorización se rechaza');
SELECT lives_ok($$ SELECT public.set_meconecta_credentials('u@x.cl', 'clave1', true) $$, 'admin guarda');
SELECT is((SELECT status FROM public.integration_connections WHERE provider = 'meconecta'), 'pendiente', 'queda pendiente y el admin la ve');
SELECT throws_ok($$ SELECT * FROM public.get_meconecta_credentials() $$, '42501', NULL, 'authenticated no puede leer la clave');

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
SELECT is((SELECT password FROM public.get_meconecta_credentials()), 'clave1', 'service_role lee la clave descifrada');

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000c1', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT public.disconnect_meconecta() $$, 'admin desconecta');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM vault.secrets WHERE name = 'meconecta_f1b64714-6de2-4d49-b6e4-5959553e94d7'), 0, 'el secreto se borra de Vault');

SELECT * FROM extensions.finish();
ROLLBACK;
```

- [ ] **Step 2: Write the migration** (`supabase/migrations/20261003120000_meconecta_credenciales.sql`)

```sql
-- Credenciales MeConecta del contratista, cifradas en Vault.
--
-- Hasta ahora el scraper usaba los secrets de Edge Functions MECONECTA_EMAIL /
-- MECONECTA_PASSWORD, es decir, una clave que conocía el equipo de Pangui. Desde
-- aquí la clave la ingresa (y revoca) un owner/admin de Electrilam; queda en
-- Vault y solo service_role (las Edge Functions) puede descifrarla.
--
-- Exclusivo de Electrilam (workspace hardcodeado, igual que el scraper).

CREATE TABLE public.integration_connections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider IN ('meconecta')),
  username      text NOT NULL,
  secret_id     uuid NOT NULL,
  status        text NOT NULL DEFAULT 'pendiente'
                CHECK (status IN ('pendiente', 'conectado', 'credenciales_invalidas', 'error')),
  last_sync_at  timestamptz,
  last_error    text,
  -- Registro de consentimiento: quién autorizó a Pangui a usar la cuenta y cuándo.
  authorized_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);

ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;

-- Owners/admins ven el estado de su conexión. secret_id es solo un puntero:
-- sin acceso al esquema vault no sirve para nada.
CREATE POLICY integration_connections_select_admin
  ON public.integration_connections FOR SELECT TO authenticated
  USING (
    workspace_id = (SELECT public.my_workspace_id())
    AND (SELECT public.my_rol()) IN ('owner', 'admin')
  );

-- Sin políticas de escritura: los usuarios escriben solo vía RPC y las Edge
-- Functions con service_role. Se quitan además los grants por defecto.
REVOKE ALL ON public.integration_connections FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.integration_connections FROM authenticated;

CREATE OR REPLACE FUNCTION public.set_meconecta_credentials(
  p_usuario text, p_clave text, p_autoriza boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ws constant uuid := 'f1b64714-6de2-4d49-b6e4-5959553e94d7';
  v_secret uuid;
BEGIN
  IF public.my_workspace_id() IS DISTINCT FROM v_ws
     OR coalesce(public.my_rol(), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_autoriza IS NOT TRUE THEN
    RAISE EXCEPTION 'Falta la autorización para sincronizar MeConecta' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_usuario), '') = '' OR coalesce(p_clave, '') = '' THEN
    RAISE EXCEPTION 'Usuario y clave son obligatorios' USING ERRCODE = '22023';
  END IF;

  SELECT secret_id INTO v_secret
    FROM public.integration_connections
   WHERE workspace_id = v_ws AND provider = 'meconecta'
   FOR UPDATE;

  IF v_secret IS NULL THEN
    v_secret := vault.create_secret(p_clave, 'meconecta_' || v_ws::text, 'Clave MeConecta del contratista');
    INSERT INTO public.integration_connections
      (workspace_id, provider, username, secret_id, authorized_by, authorized_at)
    VALUES (v_ws, 'meconecta', btrim(p_usuario), v_secret, auth.uid(), now());
  ELSE
    PERFORM vault.update_secret(v_secret, p_clave);
    UPDATE public.integration_connections
       SET username = btrim(p_usuario), status = 'pendiente', last_error = NULL,
           authorized_by = auth.uid(), authorized_at = now(), updated_at = now()
     WHERE workspace_id = v_ws AND provider = 'meconecta';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.disconnect_meconecta()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ws constant uuid := 'f1b64714-6de2-4d49-b6e4-5959553e94d7';
  v_secret uuid;
BEGIN
  IF public.my_workspace_id() IS DISTINCT FROM v_ws
     OR coalesce(public.my_rol(), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.integration_connections
   WHERE workspace_id = v_ws AND provider = 'meconecta'
  RETURNING secret_id INTO v_secret;

  IF v_secret IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret;
  END IF;
END $$;

-- Solo para las Edge Functions. authorized_at sirve de versión: los cambios de
-- estado se condicionan a él para no pisar una clave guardada a mitad de un run.
CREATE OR REPLACE FUNCTION public.get_meconecta_credentials()
RETURNS TABLE (username text, password text, status text, authorized_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.username, s.decrypted_secret, c.status, c.authorized_at
    FROM public.integration_connections c
    JOIN vault.decrypted_secrets s ON s.id = c.secret_id
   WHERE c.workspace_id = 'f1b64714-6de2-4d49-b6e4-5959553e94d7'
     AND c.provider = 'meconecta';
$$;

REVOKE ALL ON FUNCTION public.set_meconecta_credentials(text, text, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.disconnect_meconecta() FROM public, anon;
REVOKE ALL ON FUNCTION public.get_meconecta_credentials() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_meconecta_credentials(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_meconecta() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_meconecta_credentials() TO service_role;
```

- [ ] **Step 3: Verify against prod without persisting anything.** Run, via MCP `execute_sql`, one `DO $verify$ … $verify$` block that `EXECUTE`s the migration text, runs the same assertions as the pgTAP file using real Electrilam user ids (`set_config('request.jwt.claim.sub', …)` + `SET LOCAL ROLE`), and ends with `RAISE EXCEPTION 'VERIFY OK: …'`, so the whole thing rolls back. Expected: error message `VERIFY OK` with every check true; afterwards `select to_regclass('public.integration_connections')` returns null.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261003120000_meconecta_credenciales.sql supabase/tests/meconecta_credenciales.test.sql
git commit -m "MeConecta: tabla integration_connections + RPCs con Vault"
```

---

### Task 2: Scraper detects rejected credentials

**Files:**
- Modify: `supabase/functions/_shared/meconecta-scrape.ts` (`login()`)
- Create: `supabase/functions/_shared/meconecta-conexion.ts`
- Test: `tests/lib/meconecta-login.test.ts`

**Interfaces:**
- Produces (scrape): `class MeconectaAuthError extends Error`; `loginRechazado(body: string): boolean`; `login()` throws `MeconectaAuthError` when rejected.
- Produces (conexion): `type EstadoConexion = "pendiente" | "conectado" | "credenciales_invalidas" | "error"`; `interface Credenciales { username: string; password: string; status: EstadoConexion; authorized_at: string }`; `getCredenciales(supabase): Promise<Credenciales | null>`; `marcarEstado(supabase, creds: Credenciales, patch: { status?: EstadoConexion; last_sync_at?: string; last_error?: string | null }): Promise<void>`; `describirError(e: unknown): string`; `ELECTRILAM_WS: string`.

- [ ] **Step 1: Failing test** (`tests/lib/meconecta-login.test.ts`)

```ts
// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { login, loginRechazado, MeconectaAuthError } from "@/supabase/functions/_shared/meconecta-scrape";

function respuesta(body: string, cookie = "PHPSESSID=abc123; path=/") {
  return { status: 200, ok: true, headers: { get: () => cookie }, text: async () => body, body: null };
}

afterEach(() => vi.unstubAllGlobals());

describe("loginRechazado", () => {
  it("detecta login_status invalid", () => {
    expect(loginRechazado('{"login_status":"invalid","redirect_url":"index.php"}')).toBe(true);
  });
  it("no marca otros estados ni cuerpos no-JSON", () => {
    expect(loginRechazado('{"login_status":"success"}')).toBe(false);
    expect(loginRechazado("<html></html>")).toBe(false);
    expect(loginRechazado("")).toBe(false);
  });
});

describe("login", () => {
  it("lanza MeconectaAuthError aunque el portal entregue PHPSESSID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta('{"login_status":"invalid"}')));
    await expect(login("x@y.cl", "mala")).rejects.toBeInstanceOf(MeconectaAuthError);
  });
  it("devuelve la cookie cuando el login no es rechazado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta('{"login_status":"success"}')));
    await expect(login("x@y.cl", "buena")).resolves.toBe("PHPSESSID=abc123");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/lib/meconecta-login.test.ts` → FAIL (`loginRechazado` / `MeconectaAuthError` not exported).

- [ ] **Step 3: Implement in `meconecta-scrape.ts`.** Add after `export const MECONECTA_BASE = BASE;`:

```ts
/** The portal rejected the username/password — retrying will not help. */
export class MeconectaAuthError extends Error {
  override name = "MeconectaAuthError";
}

/**
 * The login endpoint answers HTTP 200 and even sets a PHPSESSID for a wrong
 * password; only the JSON body says so ({"login_status":"invalid",...}). Any
 * other or unparseable body is NOT treated as a rejection, so a markup change
 * on their side can't silently disable the integration.
 */
export function loginRechazado(body: string): boolean {
  try {
    return (JSON.parse(body) as { login_status?: unknown })?.login_status === "invalid";
  } catch {
    return false;
  }
}
```

and in `login()`, right after `const text = await res.text().catch(() => "");`:

```ts
  if (loginRechazado(text)) {
    throw new MeconectaAuthError("MeConecta rechazó el usuario o la clave");
  }
```

- [ ] **Step 4: Create `supabase/functions/_shared/meconecta-conexion.ts`**

```ts
// Credenciales MeConecta guardadas por Electrilam (Vault) y estado de la conexión.
//
// La clave se lee con get_meconecta_credentials(), que solo service_role puede
// ejecutar. Nunca se registra ni se devuelve en una respuesta.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Electrilam — el único workspace con esta integración.
export const ELECTRILAM_WS = "f1b64714-6de2-4d49-b6e4-5959553e94d7";

export type EstadoConexion = "pendiente" | "conectado" | "credenciales_invalidas" | "error";

export interface Credenciales {
  username: string;
  password: string;
  status: EstadoConexion;
  authorized_at: string;
}

/** null when Electrilam has not connected MeConecta. */
export async function getCredenciales(supabase: SupabaseClient): Promise<Credenciales | null> {
  const { data, error } = await supabase.rpc("get_meconecta_credentials");
  if (error) throw new Error(`get_meconecta_credentials: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : null;
  return (row as Credenciales | undefined) ?? null;
}

/**
 * Updates the connection's status. Conditioned on authorized_at so a run that
 * started with the old password can't overwrite a password saved meanwhile.
 */
export async function marcarEstado(
  supabase: SupabaseClient,
  creds: Credenciales,
  patch: { status?: EstadoConexion; last_sync_at?: string; last_error?: string | null },
): Promise<void> {
  await supabase
    .from("integration_connections")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("workspace_id", ELECTRILAM_WS)
    .eq("provider", "meconecta")
    .eq("authorized_at", creds.authorized_at);
}

export function describirError(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 300);
}
```

- [ ] **Step 5: Run** `npx vitest run tests/lib/meconecta-login.test.ts` → PASS.

- [ ] **Step 6: Commit** `git add supabase/functions/_shared tests/lib/meconecta-login.test.ts && git commit -m "MeConecta: distinguir clave rechazada de portal caído"`

---

### Task 3: Edge Functions read credentials from Vault

**Files:**
- Modify: `supabase/functions/meconecta-scrape-cron/index.ts`
- Modify: `supabase/functions/meconecta-check/index.ts`

**Interfaces:**
- Consumes: everything Task 2 produces.
- Produces (check): request body `{ desde?, hasta?, soloProbar?: boolean }`; error body `{ ok:false, code: "sin_conexion" | "credenciales_invalidas", error }` with HTTP 409; probe success `{ ok:true, soloProbar:true, total:number }`.

- [ ] **Step 1: Cron.** Remove the `MECONECTA_EMAIL` / `MECONECTA_PASSWORD` constants, the local `ELECTRILAM_WS` (import it), update the header comment's last line to "Credentials: Vault, entered by Electrilam in /integraciones/meconecta (see _shared/meconecta-conexion.ts).", and replace the start of the monitored body through `const scraped = …` with:

```ts
      const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Not connected, or the password was rejected: do nothing until an admin
      // (re)connects. Retrying a rejected password every 15 min would look like
      // a brute-force attempt in the university's logs and could lock the account.
      const creds = await getCredenciales(supabase);
      if (!creds || creds.status === "credenciales_invalidas") {
        return new Response(JSON.stringify({ skipped: creds ? "credenciales_invalidas" : "sin_conexion" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      let scraped: ScrapedRow[];
      try {
        scraped = await fetchOrders(await login(creds.username, creds.password));
      } catch (e) {
        if (e instanceof MeconectaAuthError) {
          await marcarEstado(supabase, creds, { status: "credenciales_invalidas", last_error: describirError(e) });
          await notificarClaveRechazada(supabase);
          return new Response(JSON.stringify({ authFailed: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        await marcarEstado(supabase, creds, { status: "error", last_error: describirError(e) });
        throw e;
      }
      await marcarEstado(supabase, creds, {
        status: "conectado", last_sync_at: new Date().toISOString(), last_error: null,
      });
```

Imports become:

```ts
import { fetchOrders, login, detalleUrl, MeconectaAuthError, type ScrapedRow } from "../_shared/meconecta-scrape.ts";
import { ELECTRILAM_WS, getCredenciales, marcarEstado, describirError } from "../_shared/meconecta-conexion.ts";
```

Add below `getRecipientUserIds`:

```ts
// One notice per rejection: after this the cron skips until someone reconnects.
async function notificarClaveRechazada(supabase: ReturnType<typeof createClient>): Promise<void> {
  const userIds = await getRecipientUserIds(supabase);
  if (userIds.length === 0) return;
  await supabase.from("notifications").insert(
    userIds.map((uid) => ({
      usuario_id: uid,
      titulo: "MeConecta rechazó la clave",
      mensaje: "Pangui dejó de revisar MeConecta. Vuelve a conectarlo en Integraciones.",
      url: "/integraciones/meconecta",
      tipo: "meconecta",
    })),
  );
}
```

- [ ] **Step 2: Check.** Remove the env constants and the local `ELECTRILAM_WS` (import it). Remove the early `if (!MECONECTA_EMAIL …) return json(…503)`. Parse `soloProbar` with the dates:

```ts
  let soloProbar = false;
  // inside the existing try, after hasta:
    soloProbar = body?.soloProbar === true;
```

Replace the `// ── Scrape the portal ──` block with:

```ts
  // ── Credentials (Vault) ──
  const creds = await getCredenciales(supabase);
  if (!creds) {
    return json({ ok: false, code: "sin_conexion", error: "MeConecta no está conectado" }, 409);
  }
  // A rejected password is only retried when the user explicitly asks to test it.
  if (creds.status === "credenciales_invalidas" && !soloProbar) {
    return json({
      ok: false, code: "credenciales_invalidas",
      error: "MeConecta rechazó la clave. Vuelve a conectarlo en Integraciones.",
    }, 409);
  }

  // ── Scrape the portal ──
  let scraped: ScrapedRow[];
  try {
    scraped = await fetchOrders(await login(creds.username, creds.password));
  } catch (e) {
    if (e instanceof MeconectaAuthError) {
      await marcarEstado(supabase, creds, { status: "credenciales_invalidas", last_error: describirError(e) });
      return json({ ok: false, code: "credenciales_invalidas", error: "MeConecta rechazó el usuario o la clave" }, 409);
    }
    await marcarEstado(supabase, creds, { status: "error", last_error: describirError(e) });
    return json({ ok: false, error: `No se pudo consultar MeConecta: ${describirError(e)}` }, 502);
  }
  await marcarEstado(supabase, creds, {
    status: "conectado", last_sync_at: new Date().toISOString(), last_error: null,
  });
  if (soloProbar) return json({ ok: true, soloProbar: true, total: scraped.length });
```

Update the header comment line "Invoked by the web app's /api/meconecta/check route" to add "(also with { soloProbar: true } for Integraciones → Probar conexión)".

- [ ] **Step 3: Type-check both functions:** `deno check supabase/functions/meconecta-scrape-cron/index.ts supabase/functions/meconecta-check/index.ts` if `deno` is installed; otherwise `npx tsc --noEmit --allowImportingTsExtensions --skipLibCheck --target es2022 --module esnext --moduleResolution bundler supabase/functions/_shared/meconecta-conexion.ts` is not meaningful for remote imports — fall back to `grep -n "MECONECTA_" supabase/functions -r` (expected: no matches) plus careful review.

- [ ] **Step 4: Commit** `git commit -am "MeConecta: Edge Functions leen la clave desde Vault"`

---

### Task 4: Web lib + check route passes `soloProbar` and `code`

**Files:**
- Create: `lib/integraciones.ts`, `lib/meconecta-conexion.ts`
- Modify: `app/api/meconecta/check/route.ts`
- Test: `tests/lib/integraciones.test.ts`

**Interfaces:**
- Produces: `puedeVerIntegraciones(workspaceId: string | null | undefined, rol: string | null | undefined): boolean`; `INTEGRACIONES: Integracion[]`; `type EstadoConexion`; `type EstadoVisible = EstadoConexion | "sin_conexion"`; `interface ConexionMeconecta { username; status; last_sync_at; last_error; authorized_at }`; `ESTADO_VISIBLE: Record<EstadoVisible, { label: string; bg: string; fg: string }>`; `estadoVisible(c: ConexionMeconecta | null): EstadoVisible`; `getConexionMeconecta()`, `guardarCredencialesMeconecta(usuario, clave, autoriza)`, `desconectarMeconecta()`, `probarMeconecta(): Promise<{ ok: boolean; error?: string; code?: string }>`.

- [ ] **Step 1: Failing test** (`tests/lib/integraciones.test.ts`)

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { puedeVerIntegraciones } from "@/lib/integraciones";
import { estadoVisible, probarMeconecta } from "@/lib/meconecta-conexion";

const ELECTRILAM = "f1b64714-6de2-4d49-b6e4-5959553e94d7";

afterEach(() => vi.unstubAllGlobals());

describe("puedeVerIntegraciones", () => {
  it("solo owner/admin de Electrilam", () => {
    expect(puedeVerIntegraciones(ELECTRILAM, "owner")).toBe(true);
    expect(puedeVerIntegraciones(ELECTRILAM, "admin")).toBe(true);
    expect(puedeVerIntegraciones(ELECTRILAM, "member")).toBe(false);
    expect(puedeVerIntegraciones("otro", "owner")).toBe(false);
    expect(puedeVerIntegraciones(null, null)).toBe(false);
  });
});

describe("estadoVisible", () => {
  it("sin fila es sin_conexion", () => expect(estadoVisible(null)).toBe("sin_conexion"));
  it("usa el status de la fila", () => {
    expect(estadoVisible({ username: "a", status: "conectado", last_sync_at: null, last_error: null, authorized_at: "" }))
      .toBe("conectado");
  });
});

describe("probarMeconecta", () => {
  it("pide la revisión en modo soloProbar y devuelve el code de error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, json: async () => ({ ok: false, code: "credenciales_invalidas", error: "rechazada" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await probarMeconecta();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ soloProbar: true });
    expect(r).toEqual({ ok: false, code: "credenciales_invalidas", error: "rechazada" });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/lib/integraciones.test.ts` → FAIL (modules missing).

- [ ] **Step 3: `lib/integraciones.ts`**

```ts
import { ELECTRILAM_WORKSPACE_ID } from "@/lib/itos-gate";
import { esAdmin } from "@/lib/roles";

/**
 * Integraciones es, por ahora, exclusivo de owners/admins de Electrilam: la
 * única integración (MeConecta, portal de la UdeC) solo existe para ellos.
 */
export function puedeVerIntegraciones(
  workspaceId: string | null | undefined,
  rol: string | null | undefined,
): boolean {
  return workspaceId === ELECTRILAM_WORKSPACE_ID && esAdmin(rol);
}

export interface Integracion {
  slug: string;
  nombre: string;
  proveedor: string;
  descripcion: string;
  href: string;
}

export const INTEGRACIONES: Integracion[] = [
  {
    slug: "meconecta",
    nombre: "MeConecta",
    proveedor: "Universidad de Concepción",
    descripcion:
      "Recibe aviso de cada solicitud nueva asignada en el portal de mantención de la UdeC y cruza sus folios con tus OTs.",
    href: "/integraciones/meconecta",
  },
];
```

- [ ] **Step 4: `lib/meconecta-conexion.ts`**

```ts
import { createClient } from "@/lib/supabase";

export type EstadoConexion = "pendiente" | "conectado" | "credenciales_invalidas" | "error";
export type EstadoVisible = EstadoConexion | "sin_conexion";

/** Lo que la UI puede ver de la conexión. La clave nunca sale de Vault. */
export interface ConexionMeconecta {
  username: string;
  status: EstadoConexion;
  last_sync_at: string | null;
  last_error: string | null;
  authorized_at: string;
}

export const ESTADO_VISIBLE: Record<EstadoVisible, { label: string; bg: string; fg: string }> = {
  conectado:              { label: "Conectado",      bg: "var(--success-bg)", fg: "var(--success)" },
  pendiente:              { label: "Verificando",    bg: "var(--st-wait-bg)", fg: "var(--st-wait-fg)" },
  credenciales_invalidas: { label: "Clave rechazada", bg: "var(--danger-bg)", fg: "var(--danger)" },
  error:                  { label: "Con errores",    bg: "var(--danger-bg)",  fg: "var(--danger)" },
  sin_conexion:           { label: "Sin conectar",   bg: "var(--surface-2)",  fg: "var(--fg-3)" },
};

export function estadoVisible(c: ConexionMeconecta | null): EstadoVisible {
  return c ? c.status : "sin_conexion";
}

/** RLS limita la lectura a owners/admins del propio workspace. */
export async function getConexionMeconecta(): Promise<ConexionMeconecta | null> {
  const { data, error } = await createClient()
    .from("integration_connections")
    .select("username, status, last_sync_at, last_error, authorized_at")
    .eq("provider", "meconecta")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ConexionMeconecta | null) ?? null;
}

/** Va directo del navegador a Vault vía RPC; no pasa por el servidor Next. */
export async function guardarCredencialesMeconecta(usuario: string, clave: string, autoriza: boolean): Promise<void> {
  const { error } = await createClient().rpc("set_meconecta_credentials", {
    p_usuario: usuario, p_clave: clave, p_autoriza: autoriza,
  });
  if (error) throw new Error(error.message);
}

export async function desconectarMeconecta(): Promise<void> {
  const { error } = await createClient().rpc("disconnect_meconecta");
  if (error) throw new Error(error.message);
}

/** Login + lectura de prueba en el servidor; actualiza el estado de la conexión. */
export async function probarMeconecta(): Promise<{ ok: boolean; error?: string; code?: string }> {
  try {
    const res = await fetch("/api/meconecta/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ soloProbar: true }),
    });
    const data = await res.json().catch(() => null);
    if (data?.ok) return { ok: true };
    return { ok: false, code: data?.code, error: data?.error ?? "No se pudo probar la conexión" };
  } catch {
    return { ok: false, error: "No se pudo contactar el servidor" };
  }
}
```

- [ ] **Step 5: Route.** In `app/api/meconecta/check/route.ts`: parse `soloProbar` alongside the dates (`let soloProbar = false;` … `soloProbar = body?.soloProbar === true;`), send `JSON.stringify({ desde, hasta, soloProbar })`, and replace the failure branch's response with:

```ts
      return NextResponse.json(
        { ok: false, code: data?.code, error: data?.error ?? `La revisión falló (HTTP ${res.status})` },
        { status: res.status === 409 ? 409 : res.status === 503 ? 503 : 502 }
      );
```

Update the header comment: replace the paragraph about MECONECTA_EMAIL secrets with "The portal credentials live in Vault (entered by Electrilam in /integraciones/meconecta); only the edge function can read them. `{ soloProbar: true }` runs just the login + fetch for Integraciones → Probar conexión."

- [ ] **Step 6: Run** `npx vitest run tests/lib/integraciones.test.ts` → PASS.

- [ ] **Step 7: Commit** `git add lib/integraciones.ts lib/meconecta-conexion.ts app/api/meconecta/check/route.ts tests/lib/integraciones.test.ts && git commit -m "MeConecta: lib de conexión y modo soloProbar en la ruta"`

---

### Task 5: Navigation + catalog page

**Files:**
- Modify: `components/AppSidebar.tsx` (Cuenta group, after Espacio de trabajo item; icon import)
- Modify: `components/GlobalTopBar.tsx` (`pageTrail`)
- Create: `components/integraciones/Logos.tsx`, `components/integraciones/useGateIntegraciones.ts`
- Create: `app/(app)/integraciones/layout.js`, `app/(app)/integraciones/page.tsx`

**Interfaces:**
- Consumes: `puedeVerIntegraciones`, `INTEGRACIONES`, `getConexionMeconecta`, `estadoVisible`, `ESTADO_VISIBLE`.
- Produces: `LogoUdec({ size }: { size: number })`, `LogoPangui({ size })`, `EstadoBadge({ estado }: { estado: EstadoVisible })` (in Logos.tsx), `useGateIntegraciones(): "cargando" | "permitido" | "denegado"`.

- [ ] **Step 1: Sidebar.** Add `Plug` to the lucide import list; import `puedeVerIntegraciones`; after the Espacio de trabajo `</SidebarMenuItem>` block add:

```tsx
              {puedeVerIntegraciones(workspaceId, effectiveRol) && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/integraciones")} tooltip="Integraciones">
                    <Link href="/integraciones" prefetch={false} style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 10 }}>
                      <Plug size={16} style={{ flexShrink: 0 }} />
                      {!collapsed && <span>Integraciones</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
```

(`effectiveRol` is the variable `isAdmin` is derived from; gate also on `mounted` like `isAdmin` does: `mounted && puedeVerIntegraciones(...)`.)

- [ ] **Step 2: Top bar.** In `pageTrail`, after the `/espacio-trabajo` line:

```ts
  if (pathname.startsWith("/integraciones/meconecta")) return ["Cuenta", "Integraciones", "MeConecta"];
  if (pathname.startsWith("/integraciones")) return ["Cuenta", "Integraciones"];
```

- [ ] **Step 3: `components/integraciones/useGateIntegraciones.ts`**

```ts
"use client";

import { useEffect, useState } from "react";
import { getPerfilUsuario } from "@/lib/perfil-usuario";
import { puedeVerIntegraciones } from "@/lib/integraciones";

/** Same gate as the sidebar item, so a typed URL doesn't get around it. */
export function useGateIntegraciones(): "cargando" | "permitido" | "denegado" {
  const [gate, setGate] = useState<"cargando" | "permitido" | "denegado">("cargando");
  useEffect(() => {
    let activo = true;
    getPerfilUsuario().then((p) => {
      if (activo) setGate(puedeVerIntegraciones(p?.workspace_id, p?.rol) ? "permitido" : "denegado");
    });
    return () => { activo = false; };
  }, []);
  return gate;
}
```

- [ ] **Step 4: `components/integraciones/Logos.tsx`**

```tsx
import { ESTADO_VISIBLE, type EstadoVisible } from "@/lib/meconecta-conexion";

// Placeholder hasta tener el logo oficial de la UdeC.
export function LogoUdec({ size }: { size: number }) {
  return (
    <div
      role="img"
      aria-label="Universidad de Concepción"
      style={{
        width: size, height: size, borderRadius: size * 0.22, flexShrink: 0,
        display: "grid", placeItems: "center",
        background: "var(--brand-tint)", color: "var(--brand)",
        fontSize: Math.round(size * 0.3), fontWeight: 500, letterSpacing: "-0.02em",
      }}
    >
      UdeC
    </div>
  );
}

export function LogoPangui({ size }: { size: number }) {
  return <img src="/logo.svg" alt="Pangui" width={size} height={size} style={{ objectFit: "contain", flexShrink: 0 }} />;
}

export function EstadoBadge({ estado }: { estado: EstadoVisible }) {
  const e = ESTADO_VISIBLE[estado];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "3px 10px", fontSize: 13, background: e.bg, color: e.fg, whiteSpace: "nowrap" }}>
      {e.label}
    </span>
  );
}
```

- [ ] **Step 5: `app/(app)/integraciones/layout.js`**

```js
// Client pages can't export metadata; the layout titles the tab "Integraciones | Pangui".
export const metadata = { title: "Integraciones" };

export default function IntegracionesLayout({ children }) {
  return children;
}
```

- [ ] **Step 6: `app/(app)/integraciones/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plug, Send, ArrowRight } from "lucide-react";
import { INTEGRACIONES } from "@/lib/integraciones";
import { getConexionMeconecta, estadoVisible, type EstadoVisible } from "@/lib/meconecta-conexion";
import { LogoUdec, EstadoBadge } from "@/components/integraciones/Logos";
import { useGateIntegraciones } from "@/components/integraciones/useGateIntegraciones";

export default function IntegracionesPage() {
  const gate = useGateIntegraciones();
  const [estado, setEstado] = useState<EstadoVisible | null>(null);

  useEffect(() => {
    if (gate !== "permitido") return;
    getConexionMeconecta()
      .then((c) => setEstado(estadoVisible(c)))
      .catch(() => setEstado("sin_conexion"));
  }, [gate]);

  if (gate === "cargando") {
    return <div style={{ minHeight: 320, display: "grid", placeItems: "center", color: "var(--fg-3)" }}><Loader2 size={20} className="animate-spin" /></div>;
  }
  if (gate === "denegado") {
    return <p style={{ padding: 32, color: "var(--fg-3)", fontSize: 14 }}>Esta sección no está disponible para tu cuenta.</p>;
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 24px 56px" }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--fg-1)" }}>Integraciones</h1>
      <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--fg-3)" }}>Conecta Pangui con los sistemas que ya usa tu equipo.</p>

      <h2 style={{ margin: "32px 0 12px", fontSize: 15, fontWeight: 500, color: "var(--fg-1)", display: "flex", alignItems: "center", gap: 8 }}>
        <Plug size={16} /> Conectores
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRACIONES.map((i) => (
          <div key={i.slug} style={{ display: "flex", flexDirection: "column", gap: 14, padding: 16, border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--fg-3)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "2px 8px" }}>{i.proveedor}</span>
              {estado && <EstadoBadge estado={estado} />}
            </div>
            <div style={{ height: 120, display: "grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-0)" }}>
              <LogoUdec size={64} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "var(--fg-1)" }}>{i.nombre}</p>
              <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: 1.5, color: "var(--fg-2)" }}>{i.descripcion}</p>
            </div>
            <Link
              href={i.href}
              prefetch={false}
              style={{ marginTop: "auto", height: 38, display: "grid", placeItems: "center", borderRadius: "var(--r-md)", background: "var(--brand)", color: "var(--brand-fg)", fontSize: 14, fontWeight: 500, textDecoration: "none" }}
            >
              {estado && estado !== "sin_conexion" ? "Administrar" : "Conectar"}
            </Link>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, padding: "28px 24px", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Send size={22} style={{ color: "var(--brand)", flexShrink: 0 }} />
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "var(--fg-1)" }}>¿No encuentras lo que buscas?</p>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--fg-3)" }}>Cuéntanos qué sistema usa tu equipo y lo evaluamos.</p>
          </div>
        </div>
        <a
          href="mailto:contacto@getpangui.com?subject=Solicitud%20de%20integraci%C3%B3n"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px", borderRadius: "var(--r-md)", border: "1px solid var(--brand)", color: "var(--brand)", fontSize: 14, fontWeight: 500, textDecoration: "none" }}
        >
          Solicitar integración <ArrowRight size={15} />
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Type-check + lint:** `npx tsc --noEmit -p .` and `npx eslint components/AppSidebar.tsx components/GlobalTopBar.tsx components/integraciones "app/(app)/integraciones"` → no new errors.

- [ ] **Step 8: Commit** `git add -A components app/\(app\)/integraciones && git commit -m "Integraciones: ítem en Cuenta y catálogo"`

---

### Task 6: MeConecta detail page + connection panel

**Files:**
- Create: `components/integraciones/ConexionMeconectaPanel.tsx`
- Create: `app/(app)/integraciones/meconecta/page.tsx`

**Interfaces:**
- Consumes: `getConexionMeconecta`, `guardarCredencialesMeconecta`, `desconectarMeconecta`, `probarMeconecta`, `estadoVisible`, `EstadoBadge`, `LogoUdec`, `LogoPangui`, `useGateIntegraciones`, shadcn `Dialog*`, `AlertDialog*`, `Input`.
- Produces: `default function ConexionMeconectaPanel()`.

- [ ] **Step 1: `components/integraciones/ConexionMeconectaPanel.tsx`**

```tsx
"use client";

/**
 * Panel de conexión MeConecta (columna derecha de /integraciones/meconecta).
 *
 * La clave va del formulario directo a Vault (RPC set_meconecta_credentials) y
 * nunca vuelve: después solo se muestra el usuario. "Probar" pide al servidor
 * un login + lectura y refresca el estado guardado.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import {
  getConexionMeconecta, guardarCredencialesMeconecta, desconectarMeconecta, probarMeconecta,
  estadoVisible, type ConexionMeconecta,
} from "@/lib/meconecta-conexion";
import { EstadoBadge } from "@/components/integraciones/Logos";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

const btn = (primario: boolean): React.CSSProperties => ({
  height: 38, width: "100%", borderRadius: "var(--r-md)", fontSize: 14, fontWeight: 500, cursor: "pointer",
  border: primario ? "none" : "1px solid var(--border-strong)",
  background: primario ? "var(--brand)" : "var(--surface-1)",
  color: primario ? "var(--brand-fg)" : "var(--fg-1)",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
});

function fechaHora(iso: string | null): string {
  if (!iso) return "Todavía no";
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
}

export default function ConexionMeconectaPanel() {
  const [conexion, setConexion] = useState<ConexionMeconecta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [probando, setProbando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [dialogo, setDialogo] = useState(false);
  const [confirmarBaja, setConfirmarBaja] = useState(false);

  const cargar = useCallback(async () => {
    try { setConexion(await getConexionMeconecta()); }
    catch { setAviso({ ok: false, texto: "No se pudo cargar el estado de la conexión" }); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function probar() {
    setProbando(true);
    setAviso(null);
    const r = await probarMeconecta();
    setAviso(r.ok ? { ok: true, texto: "Conexión verificada" } : { ok: false, texto: r.error ?? "La prueba falló" });
    await cargar();
    setProbando(false);
  }

  async function desconectar() {
    try {
      await desconectarMeconecta();
      setAviso({ ok: true, texto: "MeConecta desconectado. La clave se borró." });
      await cargar();
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo desconectar" });
    }
  }

  const estado = estadoVisible(conexion);

  return (
    <div style={{ padding: 20, border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "var(--fg-1)" }}>Conexión</p>
        {!cargando && <EstadoBadge estado={estado} />}
      </div>

      {cargando ? (
        <div style={{ display: "grid", placeItems: "center", minHeight: 80, color: "var(--fg-3)" }}><Loader2 size={18} className="animate-spin" /></div>
      ) : conexion ? (
        <dl style={{ margin: 0, display: "grid", gap: 10, fontSize: 14 }}>
          <div><dt style={{ color: "var(--fg-3)" }}>Conectado como</dt><dd style={{ margin: 0, color: "var(--fg-1)", wordBreak: "break-all" }}>{conexion.username}</dd></div>
          <div><dt style={{ color: "var(--fg-3)" }}>Última sincronización</dt><dd style={{ margin: 0, color: "var(--fg-1)" }}>{fechaHora(conexion.last_sync_at)}</dd></div>
          {conexion.status !== "conectado" && conexion.last_error && (
            <div><dt style={{ color: "var(--fg-3)" }}>Último error</dt><dd style={{ margin: 0, color: "var(--danger)" }}>{conexion.last_error}</dd></div>
          )}
        </dl>
      ) : (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--fg-2)" }}>
          Conecta la cuenta MeConecta de tu empresa para recibir aviso de cada solicitud nueva.
        </p>
      )}

      {aviso && (
        <p role="status" style={{ margin: 0, fontSize: 13, color: aviso.ok ? "var(--success)" : "var(--danger)" }}>{aviso.texto}</p>
      )}

      {!cargando && (
        <div style={{ display: "grid", gap: 8 }}>
          {conexion ? (
            <>
              <button type="button" style={btn(true)} onClick={probar} disabled={probando}>
                {probando && <Loader2 size={15} className="animate-spin" />} Probar conexión
              </button>
              <button type="button" style={btn(false)} onClick={() => setDialogo(true)}>Cambiar clave</button>
              <button type="button" onClick={() => setConfirmarBaja(true)} style={{ ...btn(false), border: "none", background: "transparent", color: "var(--danger)" }}>
                Desconectar
              </button>
            </>
          ) : (
            <button type="button" style={btn(true)} onClick={() => setDialogo(true)}>Conectar</button>
          )}
        </div>
      )}

      <CredencialesDialog
        abierto={dialogo}
        usuarioInicial={conexion?.username ?? ""}
        onCerrar={() => setDialogo(false)}
        onGuardado={async (r) => {
          setAviso(r.ok ? { ok: true, texto: "Conectado. Pangui ya puede revisar MeConecta." } : { ok: false, texto: r.error ?? "La prueba falló" });
          await cargar();
        }}
      />

      <AlertDialog open={confirmarBaja} onOpenChange={setConfirmarBaja}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desconectar MeConecta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra la clave guardada y Pangui deja de revisar el portal. Puedes volver a conectarlo cuando quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={desconectar}>Desconectar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CredencialesDialog({ abierto, usuarioInicial, onCerrar, onGuardado }: {
  abierto: boolean;
  usuarioInicial: string;
  onCerrar: () => void;
  onGuardado: (r: { ok: boolean; error?: string }) => Promise<void>;
}) {
  const [usuario, setUsuario] = useState(usuarioInicial);
  const [clave, setClave] = useState("");
  const [autoriza, setAutoriza] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada apertura parte limpia: la clave nunca queda en memoria entre intentos.
  useEffect(() => {
    if (abierto) { setUsuario(usuarioInicial); setClave(""); setAutoriza(false); setError(null); }
  }, [abierto, usuarioInicial]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await guardarCredencialesMeconecta(usuario.trim(), clave, autoriza);
      setClave("");
      const r = await probarMeconecta();
      await onGuardado(r);
      if (r.ok) onCerrar();
      else setError(r.error ?? "MeConecta no aceptó la conexión");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <DialogContent>
        <form onSubmit={enviar} style={{ display: "grid", gap: 14 }}>
          <DialogHeader>
            <DialogTitle>Conectar MeConecta</DialogTitle>
            <DialogDescription>
              Usa la cuenta de tu empresa en meconecta.udec.cl. La clave se guarda cifrada y no se vuelve a mostrar.
            </DialogDescription>
          </DialogHeader>
          <label style={{ display: "grid", gap: 6, fontSize: 14, color: "var(--fg-2)" }}>
            Usuario (correo)
            <Input type="email" autoComplete="off" required value={usuario} onChange={(e) => setUsuario(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 14, color: "var(--fg-2)" }}>
            Clave
            <Input type="password" autoComplete="new-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, lineHeight: 1.45, color: "var(--fg-1)" }}>
            <input type="checkbox" checked={autoriza} onChange={(e) => setAutoriza(e.target.checked)} style={{ marginTop: 3 }} />
            Autorizo a Pangui a sincronizar mis solicitudes de MeConecta.
          </label>
          {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>{error}</p>}
          <DialogFooter>
            <button type="submit" disabled={guardando || !autoriza || !usuario.trim() || !clave} style={{ ...btn(true), width: "auto", padding: "0 18px", opacity: guardando || !autoriza || !usuario.trim() || !clave ? 0.5 : 1 }}>
              {guardando && <Loader2 size={15} className="animate-spin" />} Guardar y probar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: `app/(app)/integraciones/meconecta/page.tsx`**

```tsx
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, Loader2, Sparkles, ListChecks, Workflow, HelpCircle, ExternalLink, Mail } from "lucide-react";
import { LogoUdec, LogoPangui } from "@/components/integraciones/Logos";
import { useGateIntegraciones } from "@/components/integraciones/useGateIntegraciones";
import ConexionMeconectaPanel from "@/components/integraciones/ConexionMeconectaPanel";

const PREGUNTAS: { q: string; a: string }[] = [
  { q: "¿Qué datos lee Pangui de MeConecta?",
    a: "Solo cuatro campos de cada solicitud asignada a tu empresa: fecha, folio, estado y el identificador interno del portal. No lee nombres, correos, teléfonos ni descripciones del solicitante." },
  { q: "¿Dónde se guarda mi clave? ¿Quién la ve?",
    a: "Se guarda cifrada en la base de datos y no se vuelve a mostrar, ni a ti ni a nadie. Nadie del equipo de Pangui la conoce: solo el proceso automático la usa para iniciar sesión." },
  { q: "¿Pangui escribe o cambia algo en MeConecta?",
    a: "No. La integración es de solo lectura." },
  { q: "¿Qué pasa si cambio mi clave en MeConecta?",
    a: "La conexión queda como \"Clave rechazada\", Pangui deja de intentar y te avisa. Vuelve aquí y usa \"Cambiar clave\"." },
  { q: "¿Cómo la desconecto?",
    a: "Con \"Desconectar\" en esta página. La clave se borra en el acto y Pangui deja de revisar el portal." },
  { q: "¿Dónde se almacenan los datos?",
    a: "En la infraestructura de Pangui (Supabase), en servidores ubicados en Estados Unidos." },
];

function Seccion({ icono, titulo, children }: { icono: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <section style={{ padding: 24, border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)" }}>
      <h2 style={{ margin: "0 0 12px", display: "flex", alignItems: "center", gap: 10, fontSize: 20, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--fg-1)" }}>
        {icono} {titulo}
      </h2>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--fg-2)" }}>{children}</div>
    </section>
  );
}

export default function MeconectaIntegracionPage() {
  const gate = useGateIntegraciones();

  if (gate === "cargando") {
    return <div style={{ minHeight: 320, display: "grid", placeItems: "center", color: "var(--fg-3)" }}><Loader2 size={20} className="animate-spin" /></div>;
  }
  if (gate === "denegado") {
    return <p style={{ padding: 32, color: "var(--fg-3)", fontSize: 14 }}>Esta sección no está disponible para tu cuenta.</p>;
  }

  return (
    <div>
      <div style={{ background: "var(--brand-tint)", padding: "20px 24px 40px" }}>
        <nav aria-label="Ruta" style={{ maxWidth: 1080, margin: "0 auto", display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--fg-3)" }}>
          <Link href="/integraciones" prefetch={false} style={{ color: "var(--fg-3)", textDecoration: "none" }}>Integraciones</Link>
          <ChevronRight size={14} />
          <span style={{ color: "var(--fg-1)" }}>MeConecta</span>
        </nav>
        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, color: "var(--fg-3)" }}>
            <LogoUdec size={44} /> <span style={{ fontSize: 20 }}>+</span> <LogoPangui size={40} />
          </div>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 500, letterSpacing: "-0.03em", color: "var(--fg-1)" }}>MeConecta y Pangui</h1>
          <p style={{ margin: 0, maxWidth: 560, fontSize: 15, lineHeight: 1.55, color: "var(--fg-2)" }}>
            Las solicitudes de mantención que la UdeC te asigna en MeConecta, a la vista de tu equipo en Pangui.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 24px 56px", alignItems: "start" }}>
        <div style={{ display: "grid", gap: 20 }}>
          <Seccion icono={<Sparkles size={20} />} titulo="Resumen">
            <p style={{ margin: 0 }}>
              Pangui revisa el portal MeConecta de la Universidad de Concepción con la cuenta de tu empresa, te avisa
              cuando aparece una solicitud nueva y te ayuda a confirmar que cada una tenga su OT. Integración
              gestionada por Pangui.
            </p>
          </Seccion>

          <Seccion icono={<ListChecks size={20} />} titulo="Qué hace">
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
              <li>Avisa a los administradores de tu empresa cada vez que MeConecta te asigna una solicitud nueva, con el enlace para abrirla.</li>
              <li>Con <strong style={{ fontWeight: 500 }}>Revisar MeConecta</strong> en Órdenes, muestra las solicitudes pendientes que aún no tienen OT y las OT abiertas cuya solicitud ya se cerró en el portal.</li>
              <li>Es de solo lectura: nunca escribe ni cambia nada en MeConecta.</li>
            </ul>
          </Seccion>

          <Seccion icono={<Workflow size={20} />} titulo="Cómo funciona">
            <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
              <li>Un administrador conecta la cuenta MeConecta de la empresa y autoriza la sincronización.</li>
              <li>Pangui revisa el portal cada 15 minutos, de lunes a sábado entre las 07:00 y las 18:00.</li>
              <li>Cada solicitud se cruza con tus OTs por el folio (SF…) escrito en el campo N° de Serie.</li>
            </ol>
          </Seccion>

          <Seccion icono={<HelpCircle size={20} />} titulo="Preguntas frecuentes">
            <div style={{ display: "grid" }}>
              {PREGUNTAS.map((p, i) => (
                <details key={p.q} style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)", padding: "12px 0" }}>
                  <summary style={{ cursor: "pointer", color: "var(--fg-1)", fontWeight: 500 }}>{p.q}</summary>
                  <p style={{ margin: "8px 0 0" }}>{p.a}</p>
                </details>
              ))}
            </div>
          </Seccion>
        </div>

        <aside style={{ display: "grid", gap: 16, position: "sticky", top: 24 }}>
          <ConexionMeconectaPanel />
          <div style={{ padding: 20, border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)", display: "grid", gap: 12, fontSize: 14 }}>
            <div>
              <p style={{ margin: 0, color: "var(--fg-3)" }}>Gestionado por</p>
              <p style={{ margin: 0, color: "var(--fg-1)" }}>Pangui</p>
            </div>
            <a href="mailto:contacto@getpangui.com?subject=Integraci%C3%B3n%20MeConecta" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--brand)", textDecoration: "none" }}>
              <Mail size={15} /> Contactar soporte
            </a>
            <a href="https://meconecta.udec.cl" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--brand)", textDecoration: "none" }}>
              <ExternalLink size={15} /> Abrir MeConecta
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + lint:** `npx tsc --noEmit -p .` and `npx eslint components/integraciones "app/(app)/integraciones"` → no new errors.

- [ ] **Step 4: Commit** `git add components/integraciones "app/(app)/integraciones" && git commit -m "Integraciones: página MeConecta con panel de conexión"`

---

### Task 7: "Revisar MeConecta" points to Integraciones when not connected

**Files:**
- Modify: `app/(app)/ordenes/MeconectaCheck.tsx` (error state, ~lines 101–160 and 356–365)

- [ ] **Step 1:** Add state `const [errorCode, setErrorCode] = useState<string | null>(null);`. Where the fetch fails (`setError(data?.error ?? …)`), also `setErrorCode(data?.code ?? null)`; reset it with `setError(null)`. In the error render, after `<span>{error}</span>`, add:

```tsx
                {(errorCode === "sin_conexion" || errorCode === "credenciales_invalidas") && (
                  <Link href="/integraciones/meconecta" prefetch={false} style={{ color: "var(--brand)", whiteSpace: "nowrap" }}>
                    Ir a Integraciones
                  </Link>
                )}
```

with `import Link from "next/link";`.

- [ ] **Step 2:** `npx tsc --noEmit -p .` → clean. Commit `git commit -am "Revisar MeConecta: enlace a Integraciones si no hay conexión"`.

---

### Task 8: Full verification

- [ ] `npx vitest run` → all green (note the count; no regressions).
- [ ] `npx tsc --noEmit -p .` and `npm run lint` → no new errors vs `origin/main`.
- [ ] `grep -rn "MECONECTA_EMAIL\|MECONECTA_PASSWORD" supabase/functions app lib` → only comments/none.
- [ ] Run the dev server and look at `/integraciones` and `/integraciones/meconecta` as an Electrilam admin (light + dark, ~390px width). Without the migration applied, `getConexionMeconecta` errors → panel shows "No se pudo cargar…"; that's expected until cutover.
- [ ] Update the spec for the two deviations decided while planning: transient failures set `status='error'`; "Probar" reuses `/api/meconecta/check` with `{ soloProbar: true }` instead of a new route.
- [ ] Commit.

## Cutover (Elías, after merge — copied from spec §4)

1. `apply_migration` with `20261003120000_meconecta_credenciales.sql`; deploy `meconecta-scrape-cron` and `meconecta-check`. The cron pauses from here.
2. Deploy web.
3. Electrilam changes its MeConecta password and enters it in Integraciones (same day).
4. `supabase secrets unset MECONECTA_EMAIL MECONECTA_PASSWORD`.
