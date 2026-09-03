/**
 * Consulta de solo lectura a la API de Flow, con la firma HMAC de lib/flow.ts.
 *
 * Sirve para verificar contra Flow real (sandbox o producción) lo que la
 * documentación pública no deja claro: qué hace exactamente changePlan, cómo
 * quedan los items, qué estado reporta una suscripción.
 *
 * Uso (PowerShell, desde C:\dev\pangui):
 *   node scripts/flow-probe.mjs <archivo .env> <path> [k=v ...]
 *
 * El path acepta con o sin barra inicial. En Git Bash conviene escribirlo SIN
 * barra ("subscription/get"): con barra, MSYS lo reescribe a una ruta de
 * Windows ("C:/Program Files/Git/subscription/get") antes de que Node lo vea.
 *
 * Ejemplos:
 *   node scripts/flow-probe.mjs .env.local /plans/list
 *   node scripts/flow-probe.mjs .env.local /subscription/get subscriptionId=sus_xxx
 *   node scripts/flow-probe.mjs .env.local /subscription/listItems subscriptionId=sus_xxx
 *   node scripts/flow-probe.mjs .env.local /customer/get customerId=cus_xxx
 *
 * Solo hace GET: no crea, cambia ni cancela nada. Para previsualizar un
 * cambio de plan (POST previewChangePlan) agrega `--post`:
 *   node scripts/flow-probe.mjs .env.local /subscription/previewChangePlan subscriptionId=sus_xxx newPlanId=esencial --post
 * previewChangePlan tampoco modifica la suscripción según Flow, pero cualquier
 * otro POST sí puede: no uses --post con otros paths.
 */
import crypto from "node:crypto";
import fs from "node:fs";

const [envFile, pathArg, ...rest] = process.argv.slice(2);
if (!envFile || !pathArg) {
  console.error("Uso: node scripts/flow-probe.mjs <archivo .env> <path> [k=v ...] [--post]");
  process.exit(1);
}

// Git Bash (MSYS) reescribe un argumento que empieza con "/" a una ruta de
// Windows: "/subscription/get" llega como "C:/Program Files/Git/subscription/get".
// Nos quedamos con los dos últimos segmentos, que son los que Flow espera.
const segmentos = pathArg.replace(/\\/g, "/").split("/").filter(Boolean);
const path = "/" + segmentos.slice(-2).join("/");

const usePost = rest.includes("--post");
const extra = Object.fromEntries(
  rest.filter(a => a.includes("=")).map(a => { const i = a.indexOf("="); return [a.slice(0, i), a.slice(i + 1)]; }),
);

const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const base = env.FLOW_ENV === "production" ? "https://www.flow.cl/api" : "https://sandbox.flow.cl/api";
const params = { apiKey: env.FLOW_API_KEY, ...extra };
const toSign = Object.keys(params).sort().map(k => `${k}${params[k]}`).join("");
const s = crypto.createHmac("sha256", env.FLOW_SECRET_KEY).update(toSign).digest("hex");
const body = new URLSearchParams({ ...params, s });

const res = usePost
  ? await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body })
  : await fetch(`${base}${path}?${body}`);

console.log(`${env.FLOW_ENV} ${usePost ? "POST" : "GET"} ${path} → HTTP ${res.status}`);

// Un path mal escrito devuelve la página de error de Flow, no JSON. Mostrar el
// texto crudo dice qué pasó; JSON.parse solo lanzaba un SyntaxError opaco.
const texto = await res.text();
try {
  console.log(JSON.stringify(JSON.parse(texto), null, 2));
} catch {
  console.log(texto.slice(0, 500));
}
