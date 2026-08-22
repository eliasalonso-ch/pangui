"use client";

/**
 * La unica fuente de verdad de las notificaciones del usuario.
 *
 * POR QUE EXISTE: habia tres copias independientes del mismo estado --
 * NotificationMenu (campana de la topbar), AppSidebar (item "Notificaciones")
 * y la pagina /notificaciones/bandeja. Cada una hacia su propio fetch, sus
 * propias mutaciones optimistas y, dos de ellas, su propia suscripcion
 * realtime. Nada las conectaba.
 *
 * El sintoma que reporto el usuario: borrar una notificacion en la campana de
 * la topbar no apagaba el punto rojo del sidebar. La topbar actualizaba su
 * array local, pero el sidebar solo se enteraba si le llegaba el evento
 * realtime -- y justo esos eventos son los que se pierden cuando la instancia
 * esta saturada. El sidebar quedaba mostrando "hay no leidas" sobre datos que
 * ya no existian.
 *
 * Ahora las tres leen del mismo cache de TanStack con la misma queryKey, asi
 * que una mutacion optimista en cualquiera de ellas repinta las tres en el
 * mismo render. De paso el numero de suscripciones realtime por pestana baja
 * de 2 a 1: `notifications` es una de las dos tablas publicadas y la instancia
 * anda justa de CPU (ver el incidente del 2026-08-22).
 */

import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

export interface NotificationRow {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string | null;
  leida: boolean | null;
  url: string | null;
  created_at: string;
}

/**
 * Un solo limite para las tres vistas. Antes la topbar traia 40 y la bandeja
 * 100: con dos queryKeys distintas eran dos caches, y por lo tanto dos fetches
 * y dos verdades. Con una sola key el limite tiene que ser uno, y 100 es el
 * mayor de los dos -- la topbar igual recorta lo que muestra.
 */
export const NOTIFICACIONES_LIMIT = 100;

export const notificacionesKey = (userId: string) => ["notificaciones", userId] as const;

async function fetchNotificaciones(userId: string): Promise<NotificationRow[]> {
  const { data, error } = await createClient()
    .from("notifications")
    .select("id,tipo,titulo,mensaje,leida,url,created_at")
    .eq("usuario_id", userId)
    .order("created_at", { ascending: false })
    .limit(NOTIFICACIONES_LIMIT);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

/**
 * @param userId  null mientras la sesion se resuelve; la query queda disabled.
 * @param realtime  Solo el componente que siempre esta montado (AppSidebar)
 *   abre el canal. Si cada consumidor abriera el suyo volveriamos a tener
 *   varias suscripciones para la misma tabla, que es justo lo que se corrige.
 */
export function useNotificaciones(userId: string | null, options?: { realtime?: boolean }) {
  const queryClient = useQueryClient();
  const realtime = options?.realtime ?? false;

  const query = useQuery({
    queryKey: notificacionesKey(userId ?? ""),
    queryFn: () => fetchNotificaciones(userId!),
    enabled: Boolean(userId),
    // Las mutaciones son optimistas y el realtime parcha el cache, asi que un
    // refetch por foco solo gastaria una request en una instancia justa de CPU.
    staleTime: 5 * 60 * 1000,
  });

  const items = query.data ?? [];
  const unreadCount = items.reduce((total, item) => total + (item.leida ? 0 : 1), 0);

  const patch = useCallback(
    (updater: (current: NotificationRow[]) => NotificationRow[]) => {
      if (!userId) return;
      queryClient.setQueryData<NotificationRow[]>(
        notificacionesKey(userId),
        (current) => updater(current ?? []),
      );
    },
    [queryClient, userId],
  );

  // ─── Realtime ──────────────────────────────────────────────────────────────
  // Parchea el cache en vez de invalidar: invalidar dispararia un refetch por
  // cada evento, y estas filas llegan enteras en el payload.
  useEffect(() => {
    if (!userId || !realtime) return;
    const sb = createClient();
    let channel: RealtimeChannel | null = null;

    channel = sb
      .channel(`notificaciones:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `usuario_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as NotificationRow;
          patch((current) => [row, ...current.filter((item) => item.id !== row.id)].slice(0, NOTIFICACIONES_LIMIT));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `usuario_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as NotificationRow;
          patch((current) => current.map((item) => (item.id === row.id ? row : item)));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `usuario_id=eq.${userId}` },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (id) patch((current) => current.filter((item) => item.id !== id));
        },
      )
      .subscribe();

    return () => {
      if (channel) void sb.removeChannel(channel);
    };
  }, [userId, realtime, patch]);

  // ─── Mutaciones ────────────────────────────────────────────────────────────
  // Todas parchean el cache compartido primero y luego escriben. Al fallar
  // reponen el estado anterior: sin eso la UI mentiria hasta el proximo fetch.

  const setRead = useMutation({
    mutationFn: async ({ id, leida }: { id: string; leida: boolean }) => {
      const { error } = await createClient()
        .from("notifications").update({ leida }).eq("id", id).eq("usuario_id", userId ?? "");
      if (error) throw error;
    },
    onMutate: ({ id, leida }) => {
      const previous = items;
      patch((current) => current.map((item) => (item.id === id ? { ...item, leida } : item)));
      return { previous };
    },
    onError: (_error, _vars, context) => { if (context?.previous) patch(() => context.previous); },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await createClient()
        .from("notifications").update({ leida: true })
        .eq("usuario_id", userId ?? "").or("leida.eq.false,leida.is.null");
      if (error) throw error;
    },
    onMutate: () => {
      const previous = items;
      patch((current) => current.map((item) => ({ ...item, leida: true })));
      return { previous };
    },
    onError: (_error, _vars, context) => { if (context?.previous) patch(() => context.previous); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient()
        .from("notifications").delete().eq("id", id).eq("usuario_id", userId ?? "");
      if (error) throw error;
    },
    onMutate: (id) => {
      const previous = items;
      patch((current) => current.filter((item) => item.id !== id));
      return { previous };
    },
    onError: (_error, _vars, context) => { if (context?.previous) patch(() => context.previous); },
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      const { error } = await createClient()
        .from("notifications").delete().eq("usuario_id", userId ?? "");
      if (error) throw error;
    },
    onMutate: () => {
      const previous = items;
      patch(() => []);
      return { previous };
    },
    onError: (_error, _vars, context) => { if (context?.previous) patch(() => context.previous); },
  });

  return {
    items,
    unreadCount,
    hasUnread: unreadCount > 0,
    loading: query.isLoading,
    setRead: (id: string, leida: boolean) => setRead.mutate({ id, leida }),
    markAllRead: () => { if (unreadCount > 0) markAllRead.mutate(); },
    remove: (id: string) => remove.mutate(id),
    clearAll: () => clearAll.mutate(),
  };
}
