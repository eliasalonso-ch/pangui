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
 *
 * ── Dos queries, no una ────────────────────────────────────────────────────
 * El cache compartido es una sola LISTA, y eso tenia un costo escondido: el
 * sidebar esta montado en TODAS las paginas de la app y lo unico que necesita
 * es saber si hay un punto que pintar. Traia 100 filas completas (titulo,
 * mensaje, url) en cada carga para responder un booleano.
 *
 * Por eso el estado esta partido en dos queries independientes:
 *
 *   - `notificacionesCountKey`: un count exacto (`head: true`) de las no
 *     leidas. Cero filas en el payload, lo resuelve el indice
 *     `idx_notifications_usuario_id_read`. Es lo unico que consume el sidebar.
 *   - `notificacionesKey`: la lista paginada (useInfiniteQuery). Solo la montan
 *     la campana y la bandeja, o sea las vistas que de verdad muestran filas.
 *
 * Las mutaciones parchean las dos, asi que siguen coincidiendo en el mismo
 * render -- que era el punto original del cache compartido.
 */

import { useCallback, useEffect, useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
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
 * Filas por pagina. Antes eran 100 de una sola vez para las tres vistas; ahora
 * la primera pagina es lo unico que se paga al abrir, y el resto llega solo si
 * el usuario baja. 30 llena de sobra la primera pantalla de la bandeja y le
 * sobra a la campana, que igual recorta lo que muestra.
 */
export const NOTIFICACIONES_PAGE_SIZE = 30;

/**
 * Cursor de keyset. NO es un offset: `.range()` obliga a Postgres a contar y
 * descartar las filas anteriores en cada pagina, y ademas se descuadra si
 * llega una notificacion nueva mientras el usuario scrollea (la fila que
 * estaba en el borde se repite o se salta).
 *
 * El cursor incluye `id` a proposito. `created_at` solo NO alcanza: las
 * notificaciones se insertan en fan-out (una OT que le avisa a todo un equipo)
 * y comparten el `now()` de la transaccion -- en produccion hay hasta 17 filas
 * del mismo usuario con timestamp identico. Con `.lt('created_at', cursor)` a
 * secas, las que empatan con el borde de la pagina se perderian sin dejar
 * rastro. La comparacion es la de tuplas: (created_at, id) < (cursor.created_at,
 * cursor.id) con el mismo orden que el indice
 * `idx_notifications_usuario_created`.
 */
interface Cursor {
  created_at: string;
  id: string;
}

export const notificacionesKey = (userId: string, onlyUnread = false) =>
  ["notificaciones", userId, onlyUnread ? "unread" : "all"] as const;

export const notificacionesCountKey = (userId: string) =>
  ["notificaciones-count", userId] as const;

const SELECT_COLUMNS = "id,tipo,titulo,mensaje,leida,url,created_at";

async function fetchNotificacionesPage(
  userId: string,
  cursor: Cursor | null,
  onlyUnread: boolean,
): Promise<NotificationRow[]> {
  let request = createClient()
    .from("notifications")
    .select(SELECT_COLUMNS)
    .eq("usuario_id", userId);

  // `leida` es nullable y las filas viejas la tienen en NULL, asi que "no
  // leida" es false O null. `is.null` sin el or() dejaria fuera la mitad.
  if (onlyUnread) request = request.or("leida.eq.false,leida.is.null");

  if (cursor) {
    // PostgREST no expone comparacion de tuplas, asi que se escribe expandida:
    // o el timestamp es estrictamente menor, o empata y el id desempata.
    request = request.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await request
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(NOTIFICACIONES_PAGE_SIZE);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

async function fetchUnreadCount(userId: string): Promise<number> {
  // head: true -> Postgres devuelve solo el Content-Range, ni una fila. Esto es
  // lo que corre en cada pagina de la app por culpa del sidebar, asi que tiene
  // que ser lo mas barato posible.
  const { count, error } = await createClient()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", userId)
    .or("leida.eq.false,leida.is.null");
  if (error) throw error;
  return count ?? 0;
}

function lastCursor(page: NotificationRow[]): Cursor | undefined {
  // Una pagina corta significa que no hay mas: pedir otra solo gastaria un
  // round-trip para recibir cero filas.
  if (page.length < NOTIFICACIONES_PAGE_SIZE) return undefined;
  const last = page[page.length - 1];
  return last ? { created_at: last.created_at, id: last.id } : undefined;
}

/**
 * Solo el contador de no leidas. Es lo que necesita el sidebar, que esta
 * montado en toda la app: sin lista, sin realtime, sin filas.
 */
export function useNotificacionesCount(userId: string | null) {
  const query = useQuery({
    queryKey: notificacionesCountKey(userId ?? ""),
    queryFn: () => fetchUnreadCount(userId!),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
  });
  return { unreadCount: query.data ?? 0, hasUnread: (query.data ?? 0) > 0 };
}

/**
 * El unico canal realtime de `notifications`. Lo abre AppSidebar, que es el
 * componente que siempre esta montado; los demas consumidores solo leen del
 * cache que este parchea. `notifications` es una de las dos tablas publicadas
 * y la instancia anda justa de CPU (incidente del 2026-08-22), asi que una
 * suscripcion por pestana es el techo.
 *
 * Parchea el cache en vez de invalidar: invalidar dispararia un refetch por
 * cada evento, y estas filas llegan enteras en el payload. Con paginacion eso
 * importa mas que antes -- un refetch ahora significa re-pedir todas las
 * paginas que el usuario tenga cargadas.
 */
export function useNotificacionesRealtime(userId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const sb = createClient();

    const listKeys = [notificacionesKey(userId, false), notificacionesKey(userId, true)];
    const countKey = notificacionesCountKey(userId);

    const patchLists = (updater: (page: NotificationRow[]) => NotificationRow[]) => {
      for (const key of listKeys) {
        queryClient.setQueryData<InfiniteData<NotificationRow[], Cursor | null>>(key, (current) =>
          current ? { ...current, pages: current.pages.map(updater) } : current,
        );
      }
    };

    const patchCount = (updater: (current: number) => number) => {
      queryClient.setQueryData<number>(countKey, (current) => Math.max(0, updater(current ?? 0)));
    };

    /** Busca una fila entre las paginas cargadas, sin aplanar el cache. */
    const findCached = (id: string): NotificationRow | undefined => {
      for (const key of listKeys) {
        const data = queryClient.getQueryData<InfiniteData<NotificationRow[], Cursor | null>>(key);
        const hit = data?.pages.flat().find((item) => item.id === id);
        if (hit) return hit;
      }
      return undefined;
    };

    const channel: RealtimeChannel = sb
      .channel(`notificaciones:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `usuario_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as NotificationRow;
          // Solo a la primera pagina: es la unica donde una fila nueva puede
          // entrar sin descuadrar los cursores de las que ya estan cargadas.
          // Y solo a la lista de "no leidas" si de verdad viene sin leer, o el
          // filtro mostraria una fila que no le corresponde.
          for (const key of listKeys) {
            const isUnreadList = key === listKeys[1];
            if (isUnreadList && row.leida) continue;
            queryClient.setQueryData<InfiniteData<NotificationRow[], Cursor | null>>(key, (current) => {
              if (!current || current.pages.length === 0) return current;
              const [first, ...rest] = current.pages;
              const deduped = (first ?? []).filter((item) => item.id !== row.id);
              return { ...current, pages: [[row, ...deduped], ...rest] };
            });
          }
          if (!row.leida) patchCount((n) => n + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `usuario_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as NotificationRow;
          // `leida` es lo unico que mueve el contador, y hay que saber el valor
          // anterior para saber en que direccion. El cache local lo tiene si la
          // fila esta cargada; con REPLICA IDENTITY DEFAULT el payload `old`
          // solo trae la PK, asi que no sirve de respaldo. Si no esta cargada,
          // se refetchea el contador -- es la query mas barata que hay aca.
          const before = findCached(row.id);
          patchLists((page) => page.map((item) => (item.id === row.id ? row : item)));
          if (!before) {
            void queryClient.invalidateQueries({ queryKey: countKey });
          } else if (!before.leida && row.leida) {
            patchCount((n) => n - 1);
          } else if (before.leida && !row.leida) {
            patchCount((n) => n + 1);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `usuario_id=eq.${userId}` },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (!id) return;
          // Mismo problema que en UPDATE: DELETE solo trae la PK, asi que si la
          // fila no estaba cargada no se sabe si contaba como no leida.
          const cached = findCached(id);
          patchLists((page) => page.filter((item) => item.id !== id));
          if (!cached) void queryClient.invalidateQueries({ queryKey: countKey });
          else if (!cached.leida) patchCount((n) => n - 1);
        },
      )
      .subscribe();

    return () => { void sb.removeChannel(channel); };
  }, [userId, queryClient]);
}

/**
 * @param userId  null mientras la sesion se resuelve; la query queda disabled.
 * @param onlyUnread  Filtra en el servidor, no en el cliente. Con paginacion
 *   el filtro tiene que viajar en la query: si se filtrara despues de traer la
 *   pagina, una pagina de 30 con 3 sin leer mostraria 3 filas y un scroll que
 *   no carga nada. Va en la queryKey porque son dos listas distintas.
 * @param enabled  La campana de la topbar lo usa para no pedir nada mientras el
 *   menu esta cerrado: montada en toda la app, su primera pagina seria una
 *   request por navegacion para filas que nadie mira. El contador de no leidas
 *   igual se pide, porque de el sale el badge.
 */
export function useNotificaciones(
  userId: string | null,
  options?: { onlyUnread?: boolean; enabled?: boolean },
) {
  const queryClient = useQueryClient();
  const onlyUnread = options?.onlyUnread ?? false;
  const enabled = (options?.enabled ?? true) && Boolean(userId);

  const query = useInfiniteQuery({
    queryKey: notificacionesKey(userId ?? "", onlyUnread),
    queryFn: ({ pageParam }) =>
      fetchNotificacionesPage(userId!, pageParam as Cursor | null, onlyUnread),
    initialPageParam: null as Cursor | null,
    getNextPageParam: (lastPage) => lastCursor(lastPage) ?? null,
    enabled,
    // Las mutaciones son optimistas y el realtime parcha el cache, asi que un
    // refetch por foco solo gastaria una request en una instancia justa de CPU.
    staleTime: 5 * 60 * 1000,
    // Sin esto, cualquier refetch (montar la bandeja de nuevo, por ejemplo)
    // re-pide TODAS las paginas que el usuario habia scrolleado, una por una y
    // en serie. Con maxPages el cache guarda como mucho 10 paginas (300 filas)
    // y el refetch cuesta a lo mas eso.
    maxPages: 10,
  });

  const items = useMemo(
    () => query.data?.pages.flat() ?? [],
    [query.data],
  );

  // Misma queryKey que el sidebar, asi que es UNA request compartida, no una
  // por consumidor. El contador no se deriva de `items` a proposito: con
  // paginacion `items` son las filas cargadas, no todas -- contar ahi diria
  // "3 sin leer" cuando hay 40 mas abajo sin traer.
  const { unreadCount } = useNotificacionesCount(userId);

  /**
   * Parchea las filas cargadas. Recorre las paginas en vez del array plano
   * porque el cache de useInfiniteQuery guarda `{ pages, pageParams }` y
   * aplastarlo romperia los cursores de las paginas siguientes.
   *
   * Toca las DOS listas (leidas y no leidas) porque el usuario puede alternar
   * el filtro: si solo se parcheara la activa, volver a la otra mostraria el
   * estado viejo hasta que venciera el staleTime.
   */
  const patch = useCallback(
    (updater: (current: NotificationRow[]) => NotificationRow[]) => {
      if (!userId) return;
      for (const key of [notificacionesKey(userId, false), notificacionesKey(userId, true)]) {
        queryClient.setQueryData<InfiniteData<NotificationRow[], Cursor | null>>(
          key,
          (current) => {
            if (!current) return current;
            return { ...current, pages: current.pages.map(updater) };
          },
        );
      }
    },
    [queryClient, userId],
  );

  /** Ajusta el contador sin volver a preguntarle a la base. */
  const patchCount = useCallback(
    (updater: (current: number) => number) => {
      if (!userId) return;
      queryClient.setQueryData<number>(notificacionesCountKey(userId), (current) =>
        Math.max(0, updater(current ?? 0)),
      );
    },
    [queryClient, userId],
  );

  // ─── Mutaciones ────────────────────────────────────────────────────────────
  // Todas parchean el cache compartido primero y luego escriben. Al fallar
  // reponen el estado anterior: sin eso la UI mentiria hasta el proximo fetch.
  //
  // El rollback ahora restaura los snapshots crudos de TanStack (pages incluidas)
  // en vez de un array plano: reponer el plano dejaria una sola pagina y mataria
  // el scroll infinito justo despues de un error de red.

  const snapshot = useCallback(() => {
    if (!userId) return null;
    return {
      lists: [notificacionesKey(userId, false), notificacionesKey(userId, true)].map(
        (key) => [key, queryClient.getQueryData(key)] as const,
      ),
      count: queryClient.getQueryData<number>(notificacionesCountKey(userId)),
    };
  }, [queryClient, userId]);

  const restore = useCallback(
    (context: ReturnType<typeof snapshot>) => {
      if (!context || !userId) return;
      for (const [key, value] of context.lists) queryClient.setQueryData(key, value);
      queryClient.setQueryData(notificacionesCountKey(userId), context.count);
    },
    [queryClient, userId],
  );

  const setRead = useMutation({
    mutationFn: async ({ id, leida }: { id: string; leida: boolean }) => {
      const { error } = await createClient()
        .from("notifications").update({ leida }).eq("id", id).eq("usuario_id", userId ?? "");
      if (error) throw error;
    },
    onMutate: ({ id, leida }) => {
      const previous = snapshot();
      const wasRead = items.find((item) => item.id === id)?.leida ?? false;
      patch((current) => current.map((item) => (item.id === id ? { ...item, leida } : item)));
      if (!wasRead && leida) patchCount((n) => n - 1);
      if (wasRead && !leida) patchCount((n) => n + 1);
      return { previous };
    },
    onError: (_error, _vars, context) => restore(context?.previous ?? null),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await createClient()
        .from("notifications").update({ leida: true })
        .eq("usuario_id", userId ?? "").or("leida.eq.false,leida.is.null");
      if (error) throw error;
    },
    onMutate: () => {
      const previous = snapshot();
      patch((current) => current.map((item) => ({ ...item, leida: true })));
      patchCount(() => 0);
      return { previous };
    },
    onError: (_error, _vars, context) => restore(context?.previous ?? null),
    // Esta toca filas que ni siquiera estan cargadas, asi que el parche
    // optimista solo cubre lo visible. Al terminar se re-sincroniza el resto.
    onSuccess: () => {
      if (!userId) return;
      void queryClient.invalidateQueries({ queryKey: ["notificaciones", userId] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient()
        .from("notifications").delete().eq("id", id).eq("usuario_id", userId ?? "");
      if (error) throw error;
    },
    onMutate: (id) => {
      const previous = snapshot();
      const wasUnread = !(items.find((item) => item.id === id)?.leida ?? false);
      patch((current) => current.filter((item) => item.id !== id));
      if (wasUnread) patchCount((n) => n - 1);
      return { previous };
    },
    onError: (_error, _vars, context) => restore(context?.previous ?? null),
  });

  /**
   * Mutaciones en lote para el modo seleccion de la bandeja.
   *
   * Existen en vez de llamar N veces a las de una sola fila: `.in("id", ids)`
   * es UNA request, y un "seleccionar todo" sobre 100 filas con las otras
   * serian 100 requests y 100 parches optimistas (o sea 100 renders) contra una
   * instancia que anda justa de CPU.
   *
   * El contador se recalcula contando cuantas de las filas afectadas estaban
   * sin leer, no restando a ciegas: seleccionar una mezcla de leidas y no
   * leidas y marcarlas todas como leidas solo puede descontar las que de
   * verdad contaban.
   */
  const setReadMany = useMutation({
    mutationFn: async ({ ids, leida }: { ids: string[]; leida: boolean }) => {
      if (ids.length === 0) return;
      const { error } = await createClient()
        .from("notifications").update({ leida })
        .in("id", ids).eq("usuario_id", userId ?? "");
      if (error) throw error;
    },
    onMutate: ({ ids, leida }) => {
      const previous = snapshot();
      const target = new Set(ids);
      // Cuantas cambian de verdad de estado: las que ya estaban como quedan no
      // mueven el contador.
      const changing = items.filter(
        (item) => target.has(item.id) && Boolean(item.leida) !== leida,
      ).length;
      patch((current) =>
        current.map((item) => (target.has(item.id) ? { ...item, leida } : item)),
      );
      patchCount((n) => (leida ? n - changing : n + changing));
      return { previous };
    },
    onError: (_error, _vars, context) => restore(context?.previous ?? null),
  });

  const removeMany = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await createClient()
        .from("notifications").delete()
        .in("id", ids).eq("usuario_id", userId ?? "");
      if (error) throw error;
    },
    onMutate: (ids) => {
      const previous = snapshot();
      const target = new Set(ids);
      const unread = items.filter((item) => target.has(item.id) && !item.leida).length;
      patch((current) => current.filter((item) => !target.has(item.id)));
      patchCount((n) => n - unread);
      return { previous };
    },
    onError: (_error, _vars, context) => restore(context?.previous ?? null),
    // Borrar filas deja huecos en las paginas cargadas: la siguiente pagina se
    // pidio con un cursor que ya no corresponde. Re-sincroniza al terminar.
    onSuccess: () => {
      if (!userId) return;
      void queryClient.invalidateQueries({ queryKey: ["notificaciones", userId] });
    },
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      const { error } = await createClient()
        .from("notifications").delete().eq("usuario_id", userId ?? "");
      if (error) throw error;
    },
    onMutate: () => {
      const previous = snapshot();
      if (userId) {
        for (const key of [notificacionesKey(userId, false), notificacionesKey(userId, true)]) {
          queryClient.setQueryData<InfiniteData<NotificationRow[], Cursor | null>>(key, {
            pages: [[]],
            pageParams: [null],
          });
        }
      }
      patchCount(() => 0);
      return { previous };
    },
    onError: (_error, _vars, context) => restore(context?.previous ?? null),
  });

  return {
    items,
    unreadCount,
    hasUnread: unreadCount > 0,
    loading: query.isLoading,
    // Scroll infinito. `isFetchingNextPage` es lo que distingue "cargando la
    // primera pantalla" de "trayendo mas abajo": la bandeja pinta un spinner
    // chico al pie en vez del estado de carga completo.
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    setRead: (id: string, leida: boolean) => setRead.mutate({ id, leida }),
    setReadMany: (ids: string[], leida: boolean) => {
      if (ids.length > 0) setReadMany.mutate({ ids, leida });
    },
    removeMany: (ids: string[]) => { if (ids.length > 0) removeMany.mutate(ids); },
    markAllRead: () => { if (unreadCount > 0) markAllRead.mutate(); },
    remove: (id: string) => remove.mutate(id),
    clearAll: () => clearAll.mutate(),
  };
}
