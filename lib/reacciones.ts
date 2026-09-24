// Emoji reactions on OT activity (actividad_reacciones): comments and status
// events. Same rules as the mobile app (pangui-native-stable/lib/reacciones.ts).

// Must match the CHECK constraint on actividad_reacciones.emoji
// (supabase/migrations/20260923230000_actividad_reacciones_mas_emojis.sql).
export const REACCIONES = ["❤️", "👍", "👎", "😂", "‼️", "❓", "😮", "😢", "🙏", "🔥", "👏", "🎉"] as const;

// Row types that take reactions — mirrors the RLS policies
// (20260924150000_reacciones_estados_y_notificaciones.sql).
export const TIPOS_REACCIONABLES = new Set([
  "comentario", "estado_cambiado", "iniciado", "pausado", "reanudado", "completado", "cancelado",
]);

export type Reaccion = { emoji: string; usuario_id: string };

// One reaction per person: picking the one you already have removes it,
// anything else replaces it.
export function siguienteReaccion(actual: string | null, elegida: string): string | null {
  return elegida === actual ? null : elegida;
}

// Chips under a row: one per emoji (first-seen order) with its count, who
// reacted, and whether one of them is me.
export function agruparReacciones(reacciones: Reaccion[] | undefined, myId: string | null | undefined) {
  const grupos = new Map<string, { emoji: string; usuarios: string[]; mine: boolean }>();
  for (const r of reacciones ?? []) {
    const g = grupos.get(r.emoji) ?? { emoji: r.emoji, usuarios: [], mine: false };
    g.usuarios.push(r.usuario_id);
    if (r.usuario_id === myId) g.mine = true;
    grupos.set(r.emoji, g);
  }
  return [...grupos.values()];
}

export function miReaccion(reacciones: Reaccion[] | undefined, myId: string | null | undefined): string | null {
  return reacciones?.find((r) => r.usuario_id === myId)?.emoji ?? null;
}
