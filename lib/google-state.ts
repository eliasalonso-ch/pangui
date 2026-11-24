import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * `state` firmado del OAuth de Google (puro, testeado). Ata la vuelta de Google
 * al usuario y workspace que inició la conexión, y vence en 10 minutos: sin
 * esto, cualquiera podría hacer que un admin conecte una cuenta ajena (CSRF).
 */

export interface EstadoOAuth { ws: string; uid: string; exp: number }

const STATE_TTL_MS = 10 * 60_000;
const firma = (payload: string, secreto: string) => createHmac("sha256", secreto).update(payload).digest();

export function firmarState(ws: string, uid: string, secreto: string, ahora = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ws, uid, exp: ahora + STATE_TTL_MS } satisfies EstadoOAuth)).toString("base64url");
  return `${payload}.${firma(payload, secreto).toString("base64url")}`;
}

export function verificarState(state: string, secreto: string, ahora = Date.now()): EstadoOAuth | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const esperada = firma(payload, secreto);
  const recibida = Buffer.from(sig, "base64url");
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  try {
    const e = JSON.parse(Buffer.from(payload, "base64url").toString()) as EstadoOAuth;
    return e.exp > ahora && e.ws && e.uid ? e : null;
  } catch {
    return null;
  }
}
