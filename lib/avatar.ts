/**
 * Avatar de usuario: iniciales sobre el degradado de marca.
 *
 * Vivia duplicado en OTRow, AppSidebar y OTDetail. Se centraliza porque las
 * tres copias tenian que verse identicas (es la misma persona en la lista, en
 * la barra y en el hilo de actividad) y porque `iniciales` tiene una sutileza
 * que no conviene reimplementar: filtra a letras/numeros reales.
 */

/**
 * Iniciales para el avatar.
 *
 * Solo usa letras/numeros. Indexar un string con `[0]` puede devolver la mitad
 * de un par surrogate de emoji (por ejemplo un "🏎️💨" al final), que se
 * serializa distinto en SSR que en el browser y provoca un hydration mismatch.
 */
export function iniciales(n: string): string {
  const words = n.trim().split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
  const glyph = (word: string) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? "";
  if (words.length === 0) return "?";
  if (words.length === 1) {
    return Array.from(words[0])
      .filter((character) => /[\p{L}\p{N}]/u.test(character))
      .slice(0, 2)
      .join("")
      .toLocaleUpperCase("es");
  }
  return `${glyph(words[0])}${glyph(words[words.length - 1])}`.toLocaleUpperCase("es");
}

/** El degradado de marca que llevan todos los avatares de usuario. */
export const AVATAR_GRADIENT = "linear-gradient(135deg, var(--brand-active), var(--brand))";

/**
 * Estilo base del avatar circular. `size` controla diametro y tamano de letra
 * juntos, para que las iniciales no queden sueltas dentro del circulo.
 */
export function avatarStyle(size: number): React.CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    background: AVATAR_GRADIENT,
    color: "var(--fg-on-brand)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: Math.max(9, Math.round(size * 0.36)),
    fontWeight: 700,
    lineHeight: 1,
  };
}
