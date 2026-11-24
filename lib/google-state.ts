import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * `state` firmado del OAuth de Google (puro, testeado). Ata la vuelta de Google
 * al usuario y workspace que inició la conexión, y vence en 10 minutos: sin
 * esto, cualquiera podría hacer que un admin conecte una cuenta ajena (CSRF).
 * `destino` dice qué se estaba conectando, para pedir y validar sus permisos y
 * volver a su página (Google Calendar o Google Tasks usan el mismo callback).
 */

export type DestinoGoogle = "calendar" | "tasks";
export interface EstadoOAuth { ws: string; uid: string; exp: number; destino: DestinoGoogle }

const STATE_TTL_MS = 10 * 60_000;
const firma = (payload: string, secreto: string) => createHmac("sha256", secreto).update(payload).digest();

export function firmarState(ws: string, uid: string, secreto: string, ahora = Date.now(), destino: DestinoGoogle = "calendar"): string {
  const payload = Buffer.from(JSON.stringify({ ws, uid, exp: ahora + STATE_TTL_MS, destino } satisfies EstadoOAuth)).toString("base64url");
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
    if (!(e.exp > ahora && e.ws && e.uid)) return null;
    return { ...e, destino: e.destino === "tasks" ? "tasks" : "calendar" };
  } catch {
    return null;
  }
}
