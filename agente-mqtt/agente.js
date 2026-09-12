#!/usr/bin/env node
/**
 * Agente on-premise: lee un broker MQTT y manda las lecturas a Pangui.
 *
 *   node agente.js            (usa ./settings.json)
 *   node agente.js otra.json
 *
 * POR QUE UN AGENTE Y NO MQTT ADENTRO DE PANGUI:
 * El broker vive en la red del cliente, detrás de su firewall, y normalmente no
 * está publicado a internet — que es justamente el punto de tenerlo. Pangui no
 * puede entrar ahí. El agente sí: corre del lado del cliente, se conecta al
 * broker por dentro y sale hacia afuera por HTTPS, sin abrir ningún puerto de
 * entrada. Es la misma forma que usa el "On-Premise Agent" de MaintainX, y la
 * razón por la que ellos tampoco hospedan el broker.
 *
 * Además desacopla las caídas: si el broker se cae, se cae el agente, no
 * Pangui. Y Pangui corre en Vercel (serverless), donde no hay dónde mantener
 * una conexión MQTT viva entre requests.
 *
 * LO QUE EL AGENTE NO HACE: decidir si una lectura abre una OT. Eso es del
 * trigger en la base, igual que para las lecturas manuales.
 */

const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");

const configPath = path.resolve(process.argv[2] || path.join(__dirname, "settings.json"));

if (!fs.existsSync(configPath)) {
  console.error(`No existe ${configPath}.\nCopia settings.example.json a settings.json y complétalo.`);
  process.exit(1);
}

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (e) {
  console.error(`settings.json no es JSON válido: ${e.message}`);
  process.exit(1);
}

const pangui = cfg.Integration?.Url || "http://localhost:3000";
const tcp = cfg.Mqtt?.client?.tcpServer ?? {};
const cred = cfg.Mqtt?.client?.credentials ?? {};
const subs = cfg.MqttSubscriptionSettings ?? [];

if (subs.length === 0) {
  console.error("settings.json no declara ninguna suscripción en MqttSubscriptionSettings.");
  process.exit(1);
}

/**
 * Cada cuánto se vacía el buffer hacia Pangui.
 *
 * No se manda una lectura por request: un gateway con 50 sensores a 1 Hz serían
 * 50 requests por segundo contra el endpoint. Se acumulan y se mandan de a
 * lotes, que es para lo que el endpoint ya acepta un array.
 */
const INTERVALO_ENVIO_MS = Number(cfg.Integration?.UploadIntervalMs) || 5000;

/** Tope por lote: el endpoint rechaza más de 500. */
const MAX_LOTE = 500;

/**
 * `pangui/medidores/+/lectura` → /^pangui\/medidores\/([^/]+)\/lectura$/
 *
 * `+` en MQTT es "un nivel cualquiera", y acá además es el valor que queremos
 * capturar: el token del medidor viaja en el topic. `#` (multinivel) no se
 * soporta como captura a propósito — no se sabría qué pedazo es el token.
 */
function patronATest(patron) {
  const partes = patron.split("/").map(p => {
    if (p === "+") return "([^/]+)";
    return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return new RegExp(`^${partes.join("/")}$`);
}

/**
 * Saca el valor numérico de un payload.
 *
 * `Raw`: el payload ES el número ("17.4"). Es lo que publica la mitad de los
 * equipos industriales.
 * `Json`: el número está en un campo ({"value":17.4}). `ValueField` dice cuál,
 * con notación de punto para anidados ("data.vibration").
 */
function extraerValor(buf, sub) {
  const texto = buf.toString("utf8").trim();

  if ((sub.DecodeMode || "Raw") === "Raw") {
    const n = Number(texto);
    return Number.isFinite(n) ? n : null;
  }

  let obj;
  try {
    obj = JSON.parse(texto);
  } catch {
    return null;
  }

  const campo = sub.ValueField || "value";
  const valor = campo.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Timestamp del payload si lo trae; si no, ahora. */
function extraerTs(buf, sub) {
  if (!sub.TimestampField) return new Date().toISOString();
  try {
    const obj = JSON.parse(buf.toString("utf8"));
    const bruto = sub.TimestampField.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (bruto == null) return new Date().toISOString();
    // Epoch en segundos o milisegundos, o una fecha ISO.
    const d = typeof bruto === "number"
      ? new Date(bruto < 1e12 ? bruto * 1000 : bruto)
      : new Date(bruto);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

const compiladas = subs.map(s => ({ ...s, re: patronATest(s.Topic) }));

/** Buffer por token: { token → [{valor, ts}, ...] }. */
const pendientes = new Map();
let enviadas = 0;
let descartadas = 0;

const url = `mqtt://${tcp.server || "localhost"}:${tcp.port || 1883}`;
console.log(`Conectando a ${url}`);
console.log(`Enviando a ${pangui} cada ${INTERVALO_ENVIO_MS / 1000}s\n`);

const client = mqtt.connect(url, {
  username: cred.username || undefined,
  password: cred.password || undefined,
  clientId: cfg.Mqtt?.client?.clientId || `pangui-agente-${Math.random().toString(16).slice(2, 10)}`,
  reconnectPeriod: 5000,
});

client.on("connect", () => {
  console.log("Conectado al broker.");
  for (const s of compiladas) {
    client.subscribe(s.Topic, { qos: s.Qos ?? 1 }, err => {
      if (err) console.error(`  ✗ ${s.Topic}: ${err.message}`);
      else console.log(`  ✓ suscrito a ${s.Topic} (${s.DecodeMode || "Raw"})`);
    });
  }
  console.log();
});

client.on("message", (topic, payload) => {
  const sub = compiladas.find(s => s.re.test(topic));
  if (!sub) return;

  // El token es el `+` del patrón. Si la suscripción fija el medidor en la
  // config (TokenOverride), se usa ese: sirve para equipos que no pueden
  // meter un token en el topic.
  const m = topic.match(sub.re);
  const token = sub.TokenOverride || (m && m[1]);
  if (!token) return;

  const valor = extraerValor(payload, sub);
  if (valor == null) {
    // No se reintenta: un payload que no parsea no va a parsear mejor después.
    descartadas++;
    console.warn(`  ! ${topic}: payload no numérico (${payload.toString("utf8").slice(0, 40)})`);
    return;
  }

  const lista = pendientes.get(token) ?? [];
  lista.push({ valor, ts: extraerTs(payload, sub) });
  pendientes.set(token, lista);
});

client.on("error", e => console.error(`Broker: ${e.message}`));
client.on("reconnect", () => console.log("Reconectando al broker…"));

/**
 * Vacía el buffer.
 *
 * Un lote por token, porque el endpoint autentica por token: son medidores
 * distintos y no pueden ir en el mismo request.
 *
 * ponytail: si el POST falla, las lecturas de ese lote se pierden. Para un
 * agente de verdad habría que reencolarlas con tope y backoff; acá el broker
 * ya guarda lo suyo y una lectura perdida en un prototipo no cuesta nada.
 * Upgrade: reencolar en `pendientes` si el status es 5xx.
 */
async function vaciar() {
  if (pendientes.size === 0) return;

  const lotes = [...pendientes.entries()];
  pendientes.clear();

  for (const [token, lecturas] of lotes) {
    // Si se acumularon más de las que acepta el endpoint, se manda de a tandas.
    for (let i = 0; i < lecturas.length; i += MAX_LOTE) {
      const tanda = lecturas.slice(i, i + MAX_LOTE);
      try {
        const res = await fetch(`${pangui}/api/medidores/lecturas`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(tanda),
        });
        const cuerpo = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error(`  ✗ ${res.status} ${cuerpo.error ?? ""} (token …${token.slice(-6)})`);
          continue;
        }
        enviadas += tanda.length;
        console.log(`  → ${tanda.length} lectura(s) enviada(s) [token …${token.slice(-6)}] · total ${enviadas}`);
      } catch (e) {
        console.error(`  ✗ sin conexión a Pangui: ${e.message}`);
      }
    }
  }
}

setInterval(() => { vaciar(); }, INTERVALO_ENVIO_MS);

// Vaciar antes de salir para no perder lo que quedó en el buffer.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    console.log("\nCerrando… vaciando buffer.");
    await vaciar();
    client.end(true, () => {
      console.log(`Enviadas ${enviadas}, descartadas ${descartadas}.`);
      process.exit(0);
    });
  });
}
