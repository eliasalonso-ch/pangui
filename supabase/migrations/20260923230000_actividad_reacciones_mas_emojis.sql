-- Widen the reaction set from the 6 classic tapbacks to 12 — the mobile
-- long-press overlay shows them in a horizontally scrollable pill (like
-- Messages). Additive: every value allowed before is still allowed.

alter table public.actividad_reacciones drop constraint actividad_reacciones_emoji_check;
alter table public.actividad_reacciones add constraint actividad_reacciones_emoji_check
  check (emoji in ('❤️', '👍', '👎', '😂', '‼️', '❓', '😮', '😢', '🙏', '🔥', '👏', '🎉'));
