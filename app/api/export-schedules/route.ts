// CRUD for export_schedules.
//
// Auth: workspace admin/owner only — enforced by RLS via the existing
// auth_workspace_id() helper. This route just shapes payloads and forwards
// to Supabase. RLS rejects with 403 on non-admins.
//
// GET                                 — list all schedules in this workspace
// POST   { nombre, frequency, ... }   — create
// PATCH  { id, ...partial }           — update one
// DELETE ?id=<uuid>                   — delete one

import { createServerClient } from "@supabase/ssr";
import { cookies }            from "next/headers";
import { NextResponse }       from "next/server";

async function sb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()      { return cookieStore.getAll(); },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
          );
        },
      },
    }
  );
}

// ── Validation ──────────────────────────────────────────────────────────────

const FREQUENCIES = ["weekly", "monthly", "yearly"] as const;
type Frequency = typeof FREQUENCIES[number];

const PRESETS = ["todas", "pendientes", "sin_asignar", "en_curso", "urgentes", "completadas", "levantamientos"] as const;
type Preset = typeof PRESETS[number];

interface SchedulePayload {
  nombre?: string;
  frequency?: Frequency;
  day_of_week?: number | null;
  day_of_month?: number | null;
  month_of_year?: number | null;
  hour_local?: number;
  timezone?: string;
  filter_preset?: Preset;
  columns_json?: Record<string, boolean>;
  recipients?: string[];
  active?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(body: SchedulePayload, partial: boolean): string | null {
  if (!partial) {
    if (!body.nombre || body.nombre.trim().length < 2) return "Nombre demasiado corto.";
    if (!body.frequency || !FREQUENCIES.includes(body.frequency)) return "Frecuencia inválida.";
    if (!Array.isArray(body.recipients) || body.recipients.length === 0) return "Debe haber al menos un destinatario.";
  }
  if (body.recipients) {
    if (body.recipients.length > 20) return "Máximo 20 destinatarios por programación.";
    for (const r of body.recipients) {
      if (!EMAIL_RE.test(r)) return `Correo inválido: ${r}`;
    }
  }
  if (body.frequency === "weekly") {
    if (body.day_of_week == null || body.day_of_week < 0 || body.day_of_week > 6) return "Día de la semana inválido.";
  }
  if (body.frequency === "monthly" || body.frequency === "yearly") {
    if (body.day_of_month == null || body.day_of_month < 1 || body.day_of_month > 31) return "Día del mes inválido.";
  }
  if (body.frequency === "yearly") {
    if (body.month_of_year == null || body.month_of_year < 1 || body.month_of_year > 12) return "Mes inválido.";
  }
  if (body.hour_local != null && (body.hour_local < 0 || body.hour_local > 23)) return "Hora inválida.";
  if (body.filter_preset && !PRESETS.includes(body.filter_preset)) return "Filtro inválido.";
  return null;
}

// ── GET: list schedules for the caller's workspace ─────────────────────────

export async function GET() {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: schedules, error } = await supabase
    .from("export_schedules")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Inline the last 3 runs per schedule for the UI.
  const ids = (schedules ?? []).map((s: { id: string }) => s.id);
  let lastRuns: Record<string, unknown[]> = {};
  if (ids.length > 0) {
    const { data: runs } = await supabase
      .from("export_runs")
      .select("id, schedule_id, started_at, ok, error_message, num_emails_sent, ordenes_count")
      .in("schedule_id", ids)
      .order("started_at", { ascending: false })
      .limit(60);
    lastRuns = (runs ?? []).reduce<Record<string, unknown[]>>((acc, r) => {
      const list = acc[(r as { schedule_id: string }).schedule_id] ?? [];
      if (list.length < 3) list.push(r);
      acc[(r as { schedule_id: string }).schedule_id] = list;
      return acc;
    }, {});
  }

  return NextResponse.json({ schedules: schedules ?? [], runs_by_schedule: lastRuns });
}

// ── POST: create a new schedule ────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Resolve the caller's workspace + role.
  const { data: caller } = await supabase
    .from("usuarios")
    .select("workspace_id, rol")
    .eq("id", user.id)
    .maybeSingle();
  if (!caller?.workspace_id) return NextResponse.json({ error: "Sin workspace." }, { status: 403 });
  if (!["admin", "owner"].includes(caller.rol ?? "")) {
    return NextResponse.json({ error: "Solo admin/owner pueden programar reportes." }, { status: 403 });
  }

  const body: SchedulePayload = await req.json();
  const err = validate(body, false);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const { data, error } = await supabase
    .from("export_schedules")
    .insert({
      workspace_id:  caller.workspace_id,
      nombre:        body.nombre!.trim(),
      frequency:     body.frequency,
      day_of_week:   body.frequency === "weekly" ? body.day_of_week ?? null : null,
      day_of_month:  body.frequency !== "weekly" ? body.day_of_month ?? null : null,
      month_of_year: body.frequency === "yearly" ? body.month_of_year ?? null : null,
      hour_local:    body.hour_local ?? 6,
      timezone:      body.timezone ?? "America/Santiago",
      filter_preset: body.filter_preset ?? "todas",
      columns_json:  body.columns_json ?? {},
      recipients:    body.recipients,
      active:        body.active !== false,
      created_by:    user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data });
}

// ── PATCH: update one schedule ─────────────────────────────────────────────

export async function PATCH(req: Request) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body: SchedulePayload & { id?: string } = await req.json();
  if (!body.id) return NextResponse.json({ error: "Falta id." }, { status: 400 });

  const err = validate(body, true);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  // RLS handles the admin/owner gate; we just forward fields.
  const update: Record<string, unknown> = {};
  if (body.nombre        != null) update.nombre        = body.nombre.trim();
  if (body.frequency     != null) update.frequency     = body.frequency;
  if (body.day_of_week   !== undefined) update.day_of_week  = body.day_of_week;
  if (body.day_of_month  !== undefined) update.day_of_month = body.day_of_month;
  if (body.month_of_year !== undefined) update.month_of_year = body.month_of_year;
  if (body.hour_local    != null) update.hour_local    = body.hour_local;
  if (body.timezone      != null) update.timezone      = body.timezone;
  if (body.filter_preset != null) update.filter_preset = body.filter_preset;
  if (body.columns_json  != null) update.columns_json  = body.columns_json;
  if (body.recipients    != null) update.recipients    = body.recipients;
  if (body.active        != null) update.active        = body.active;

  const { data, error } = await supabase
    .from("export_schedules")
    .update(update)
    .eq("id", body.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data });
}

// ── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(req: Request) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id." }, { status: 400 });

  const { error } = await supabase.from("export_schedules").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
