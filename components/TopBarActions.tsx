"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Lets a page contribute icon buttons to the GlobalTopBar, which lives in
 * AppShell and is therefore a sibling of the page — not an ancestor it can
 * render into. A page calls useTopBarAction(...) and the bar renders whatever
 * is currently registered, immediately to the left of the notification bell.
 */
export type TopBarAction = {
  /** Stable identity so re-registration replaces rather than duplicates. */
  id: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Lower numbers render further left. */
  order?: number;
};

type Registry = {
  actions: TopBarAction[];
  register: (action: TopBarAction) => void;
  unregister: (id: string) => void;
};

const TopBarActionsContext = createContext<Registry | null>(null);

export function TopBarActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<TopBarAction[]>([]);

  const register = useCallback((action: TopBarAction) => {
    setActions((prev) => {
      const next = prev.filter((a) => a.id !== action.id);
      next.push(action);
      return next.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setActions((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const value = useMemo(() => ({ actions, register, unregister }), [actions, register, unregister]);

  return <TopBarActionsContext.Provider value={value}>{children}</TopBarActionsContext.Provider>;
}

export function useTopBarActions(): TopBarAction[] {
  return useContext(TopBarActionsContext)?.actions ?? [];
}

/**
 * Registers a top-bar action for as long as the calling component is mounted.
 * `deps` should include every value the action closes over (disabled state,
 * handlers) so the bar re-renders with current data rather than a stale closure.
 */
export function useTopBarAction(action: TopBarAction | null, deps: unknown[]) {
  const ctx = useContext(TopBarActionsContext);
  const id = action?.id;

  useEffect(() => {
    if (!ctx || !action) return;
    ctx.register(action);
    return () => ctx.unregister(action.id);
    // The caller owns the dependency list; `id` guards identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.register, ctx?.unregister, id, ...deps]);
}
