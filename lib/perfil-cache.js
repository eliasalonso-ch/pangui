const KEY = "pangui_perfil";

export function getPerfilCache(userId) {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached.userId !== userId) return null;
    return cached;
  } catch { return null; }
}

export function setPerfilCache(userId, perfil) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...perfil, userId }));
  } catch {}
}

export function clearPerfilCache() {
  try { sessionStorage.removeItem(KEY); } catch {}
}
