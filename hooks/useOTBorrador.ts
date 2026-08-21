"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchBorrador,
  saveBorrador,
  deleteBorrador,
  borradorTieneContenido,
  type BorradorPayload,
} from "@/lib/ot-borradores-api";
import {
  readLocalBorrador,
  writeLocalBorrador,
  clearLocalBorrador,
} from "@/lib/ot-borrador-local";

const AUTOSAVE_DEBOUNCE_MS = 1200;

export const borradorKey = (userId: string, wsId: string) =>
  ["ot-borrador", userId, wsId] as const;

/**
 * Autosaving draft for the OT creation form.
 *
 * Debounce, not save-per-keystroke: the form has ~14 fields and users type
 * continuously, so an unthrottled mutation would fire a write per character.
 * The timer resets on every change and only the latest payload is ever sent.
 *
 * The mutation is deliberately NOT optimistic. There is no UI reading the
 * draft while the form is open — the form state itself is the source of truth
 * on screen — so an optimistic cache write would only add a rollback path for
 * no visible benefit. The draft is read exactly once, on mount.
 */
export function useOTBorrador(userId: string, wsId: string) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<BorradorPayload | null>(null);

  // Read synchronously during the first render (lazy useState initialiser) so
  // the form can hydrate before paint instead of after a round-trip.
  const [borradorLocal, setBorradorLocal] = useState(() =>
    readLocalBorrador(userId, wsId),
  );

  // staleTime: Infinity — the draft is only interesting at mount. Refetching
  // it later would fight whatever the user is currently typing.
  const query = useQuery({
    queryKey: borradorKey(userId, wsId),
    queryFn: () => fetchBorrador(userId, wsId),
    staleTime: Infinity,
    gcTime: 0,
    retry: 1,
    enabled: Boolean(userId && wsId),
  });

  // Last confirmed server write, for the "Guardado" indicator. Local mirroring
  // is not enough to claim saved: it does not survive a cleared cache.
  const [guardadoAt, setGuardadoAt] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (payload: BorradorPayload) => saveBorrador(userId, wsId, payload),
    onSuccess: () => setGuardadoAt(new Date().toISOString()),
    // A failed autosave is not worth interrupting the user for: they still
    // have their work on screen and the next keystroke schedules another try.
    onError: () => {},
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteBorrador(userId, wsId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: borradorKey(userId, wsId) });
    },
  });

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending && borradorTieneContenido(pending)) {
      saveMutation.mutate(pending);
    }
  }, [saveMutation]);

  const scheduleSave = useCallback(
    (payload: BorradorPayload) => {
      // Mirror immediately — synchronous and free. This is what makes the
      // draft survive a crash inside the debounce window, and what the next
      // mount hydrates from.
      if (borradorTieneContenido(payload)) {
        writeLocalBorrador(userId, wsId, payload);
      } else {
        clearLocalBorrador(userId, wsId);
      }
      pendingRef.current = payload;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        // An empty form should not create a row, but it must still clear a
        // draft the user just emptied on purpose.
        if (!pending) return;
        if (borradorTieneContenido(pending)) saveMutation.mutate(pending);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [saveMutation, userId, wsId],
  );

  const discard = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    clearLocalBorrador(userId, wsId);
    setBorradorLocal(null);
    deleteMutation.mutate();
  }, [deleteMutation, userId, wsId]);

  // Last line of defence: the user closes the tab inside the debounce window.
  // `visibilitychange` fires reliably on mobile/bfcache paths where `unload`
  // does not, and keepalive lets the request outlive the page.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      // Unmounting mid-debounce (client-side navigation away) must not drop
      // the pending edit.
      flush();
    };
  }, [flush]);

  // Local-first: whichever is newer wins. Local is normally ahead (it is
  // written on the keystroke, the server after the debounce), but a draft
  // saved on another device only exists server-side.
  const servidor = query.data ?? null;
  let borradorGuardado = borradorLocal ?? servidor;
  if (borradorLocal && servidor) {
    borradorGuardado =
      new Date(servidor.actualizado_at) > new Date(borradorLocal.actualizado_at)
        ? servidor
        : borradorLocal;
  }

  return {
    borradorGuardado,
    // Only a real wait: if local already answered there is nothing to wait for.
    cargando: query.isLoading && !borradorLocal,
    guardadoLocal: borradorLocal != null,
    scheduleSave,
    discard,
    guardando: saveMutation.isPending,
    guardadoAt,
    // A failed autosave is silent by design, but the UI should be able to say
    // "not saved yet" rather than implying everything is fine.
    fallo: saveMutation.isError,
  };
}
