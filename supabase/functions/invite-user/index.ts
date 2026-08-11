import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Verify caller is authenticated ──────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client — used for all DB/admin operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── 2. Extract caller ID from JWT (already verified by Supabase gateway) ─
    // Calling auth.getUser() from inside an edge function can fail intermittently;
    // the JWT is already validated before the function runs — decode it directly.
    const token = authHeader.replace("Bearer ", "");
    let callerId: string;
    try {
      // JWT uses base64url (- and _ instead of + and /), atob needs standard base64
      const base64url = token.split(".")[1];
      const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, "=");
      const payload = JSON.parse(atob(padded));
      callerId = payload.sub;
      if (!callerId) throw new Error("no sub");
    } catch (e) {
      console.error("[invite] JWT decode failed:", e);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from("usuarios")
      .select("id, rol, workspace_id")
      .eq("id", callerId)
      .single();

    if (profileError || !callerProfile) {
      console.error("[invite] profile fetch failed:", profileError?.message, "userId:", callerId);
      return new Response(JSON.stringify({ error: "Caller profile not found", detail: profileError?.message }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Only owner and admins can invite ────────────────────────────────
    console.log("[invite] caller rol:", callerProfile.rol, "workspace:", callerProfile.workspace_id);
    if (!["owner", "admin"].includes(callerProfile.rol)) {
      return new Response(JSON.stringify({ error: "Only owners and admins can invite users" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const workspaceId = callerProfile.workspace_id;
    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "Caller has no workspace" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3b. Plan gate ───────────────────────────────────────────────────────
    // Billing is per active user, so every invite adds to the monthly charge.
    // A workspace on `basic_free` (trial over, no paid plan) must pick a plan
    // before growing the team — otherwise it keeps adding billable people at
    // $0/user. `trialing` and `active` invite freely.
    //
    // This mirrors the identical check in the web `invitar` function. Until it
    // existed here, mobile could add users a plan did not cover, and the web
    // app inherited the bypass once it moved onto this function.
    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("status")
      .eq("workspace_id", workspaceId)
      .neq("status", "canceled")
      .maybeSingle();

    if (subscription?.status === "basic_free") {
      return new Response(
        JSON.stringify({
          error: "Tu prueba terminó. Elige un plan en Suscripción para invitar usuarios.",
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 4. Parse request body ───────────────────────────────────────────────
    const { email: rawEmail, nombre: rawNombre, rol, cargo: rawCargo, cargo_id, oficio: rawOficio, oficio_id } = await req.json() as {
      email: string;
      nombre: string;
      rol: string;
      cargo?: string;
      cargo_id?: string | null;
      oficio?: string;
      oficio_id?: string | null;
    };

    const email = rawEmail?.trim().toLowerCase();
    const nombre = rawNombre?.trim();
    const cargo = rawCargo?.trim() || null;
    const oficio = rawOficio?.trim() || null;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email || !nombre || !rol) {
      return new Response(JSON.stringify({ error: "email, nombre, and rol are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!emailPattern.test(email) || nombre.length < 2 || nombre.length > 120 || (cargo?.length ?? 0) > 120 || (oficio?.length ?? 0) > 120) {
      return new Response(JSON.stringify({ error: "Los datos de la invitación no son válidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const catalogChecks = [
      cargo_id ? supabaseAdmin.from("cargos").select("id").eq("id", cargo_id).or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`).eq("activo", true).maybeSingle() : null,
      oficio_id ? supabaseAdmin.from("oficios").select("id").eq("id", oficio_id).or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`).eq("activo", true).maybeSingle() : null,
    ].filter(Boolean);
    const catalogResults = await Promise.all(catalogChecks);
    if (catalogResults.some((result) => result?.error || !result?.data)) {
      return new Response(JSON.stringify({ error: "El cargo o el oficio seleccionado no es válido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowedRoles = ["member", "admin", "requester"];
    if (!allowedRoles.includes(rol)) {
      return new Response(JSON.stringify({ error: "Invalid rol" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 5. Check email isn't already in this workspace ──────────────────────
    // Look up auth users by email
    let existingAuthUser: { id: string; email?: string } | undefined;
    for (let page = 1; page <= 20 && !existingAuthUser; page += 1) {
      const { data: existingAuthUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (listError) throw listError;
      existingAuthUser = existingAuthUsers.users.find((user) => user.email?.toLowerCase() === email);
      if (existingAuthUsers.users.length < 1000) break;
    }

    if (existingAuthUser) {
      // Check if they already belong to a workspace
      const { data: existingProfile } = await supabaseAdmin
        .from("usuarios")
        .select("id, workspace_id")
        .eq("id", existingAuthUser.id)
        .maybeSingle();

      if (existingProfile?.workspace_id) {
        return new Response(
          JSON.stringify({ error: "Este correo ya está registrado en un workspace" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── 6. Invite via Supabase Auth ─────────────────────────────────────────
    // This sends an email invite. The user sets their password on first login.
    // We store workspace_id + rol in user_metadata so the trigger can use them.
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          nombre,
          rol,
          cargo,
          cargo_id: cargo_id ?? null,
          oficio,
          oficio_id: oficio_id ?? null,
          workspace_id: workspaceId,
          invited_by: callerId,
        },
        // Always land on HTTPS first. Email clients and in-app browsers often
        // block server redirects directly to custom app schemes, leaving a
        // blank page. The web invite page creates the password and only then
        // offers to open the installed app.
        redirectTo: "https://getpangui.com/invite",
      }
    );

    if (inviteError) {
      console.error("[invite] inviteUserByEmail failed:", inviteError.message, "email:", email);
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = inviteData.user.id;

    // ── 7. Pre-create the usuarios row ─────────────────────────────────────
    // This makes them immediately visible in the team list + assignable to OTs
    // even before they accept the invite.
    const { error: insertError } = await supabaseAdmin.from("usuarios").upsert({
      id: newUserId,
      nombre,
      rol,
      cargo,
      cargo_id: cargo_id ?? null,
      oficio,
      oficio_id: oficio_id ?? null,
      workspace_id: workspaceId,
      activo: true,
      onboarding_done: false,
    }, { onConflict: "id" });

    if (insertError) {
      // Non-fatal — the trigger on signup will also create the row
      console.error("Failed to pre-create usuarios row:", insertError.message);
    }

    return new Response(
      JSON.stringify({ success: true, userId: newUserId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
