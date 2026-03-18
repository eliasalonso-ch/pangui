const SF_BASE = "https://api.simplefactura.cl";

// Module-level cache — survives across requests in the same process
let cachedToken    = null;
let cachedTokenExp = 0;

export async function getToken() {
  const now = Date.now();
  // Reuse if still valid with 5-minute buffer
  if (cachedToken && now < cachedTokenExp - 5 * 60 * 1000) {
    return cachedToken;
  }

  const res = await fetch(`${SF_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email:    process.env.SIMPLEFACTURA_EMAIL?.trim(),
      password: process.env.SIMPLEFACTURA_PASSWORD?.trim(),
    }),
  });

  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch {
    throw new Error(`SimpleFactura /token no devolvió JSON: ${text.slice(0, 200)}`);
  }

  const token = body.data?.token ?? body.data?.accessToken ?? body.token ?? body.accessToken;
  if (!res.ok || !token) {
    throw new Error(`Auth falló: ${body.message || text.slice(0, 200)}`);
  }

  cachedToken    = token;
  // expiresIn is in seconds if present, otherwise assume 24h
  const expiresIn = body.expiresIn ?? body.data?.expiresIn ?? 86400;
  cachedTokenExp  = now + expiresIn * 1000;

  return cachedToken;
}

export { SF_BASE };
