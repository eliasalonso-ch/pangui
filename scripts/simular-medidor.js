#!/usr/bin/env node
/**
 * Simulador de un medidor: hace lo mismo que haría un ESP32 o un gateway.
 *
 *   node scripts/simular-medidor.js pang_mtr_xxx
 *   node scripts/simular-medidor.js pang_mtr_xxx --base 2.5 --deriva 0.15 --cada 3
 *   node scripts/simular-medidor.js pang_mtr_xxx --mqtt          (publica al broker)
 *
 * Con --mqtt no habla con Pangui: publica en el broker y es el agente
 * (agente-mqtt/) el que recoge y reenvía. Es el camino de un equipo industrial
 * de verdad, donde el sensor no sabe que Pangui existe.
 *
 * No hay nada de "simulación" del lado del servidor: este script pega en el
 * mismo endpoint, con el mismo token y el mismo payload que un equipo real. Por
 * eso cuando llegue el hardware no se cambia nada del servidor — se apaga esto.
 *
 * El valor NO es aleatorio alrededor de una media: eso nunca cruza el umbral y
 * no se ve nada. Hace una rampa con ruido —la máquina que se va degradando—,
 * que es el caso que el sistema tiene que detectar. Al cruzar el crítico el
 * trigger abre la OT, y ahí el script sigue publicando para que se vea que NO
 * se abre una segunda (el dedupe).
 */

const args = process.argv.slice(2);
const token = args.find(a => !a.startsWith("--"));

/** Lee `--clave valor` con un default. */
function opt(nombre, porDefecto) {
  const i = args.indexOf(`--${nombre}`);
  if (i === -1 || i === args.length - 1) return porDefecto;
  const v = Number(args[i + 1]);
  return Number.isFinite(v) ? v : porDefecto;
}

const URL_BASE = process.env.PANGUI_URL || "http://localhost:3000";
const usarMqtt = args.includes("--mqtt");
const BROKER = process.env.MQTT_URL || "mqtt://localhost:1883";
const base = opt("base", 2.5);        // valor inicial, en la unidad del medidor
const deriva = opt("deriva", 0.15);   // cuánto sube por lectura, en promedio
const cada = opt("cada", 3);          // segundos entre lecturas
const ruido = opt("ruido", 0.2);      // amplitud del ruido de medición

if (!token) {
  console.error(`
Falta el token del medidor.

  node scripts/simular-medidor.js pang_mtr_xxx [--base 2.5] [--deriva 0.15] [--cada 3] [--ruido 0.2]

El token sale de la ficha del medidor (tipo "Automatizado"), botón Copiar.
Contra producción: PANGUI_URL=https://tu-dominio node scripts/simular-medidor.js ...
`.trim());
  process.exit(1);
}

let valor = base;
let n = 0;

// El cliente MQTT solo se carga si hace falta: el modo HTTP no debe exigir que
// `mqtt` este instalado (vive en agente-mqtt/, no en la app).
let mqttClient = null;
if (usarMqtt) {
  let mqtt;
  try {
    mqtt = require("../agente-mqtt/node_modules/mqtt");
  } catch {
    console.error("Falta el cliente mqtt. Corre: cd agente-mqtt && npm install");
    process.exit(1);
  }
  mqttClient = mqtt.connect(BROKER);
  mqttClient.on("connect", () => console.log(`Conectado al broker ${BROKER}`));
  mqttClient.on("error", e => { console.error(`Broker: ${e.message}`); process.exit(1); });
}

async function publicar() {
  n++;
  // Rampa + ruido, con piso en 0: ninguna magnitud física de estas es negativa
  // y un -0.3 mm/s en el gráfico solo confunde.
  valor = Math.max(0, valor + deriva + (Math.random() - 0.5) * 2 * ruido);
  const redondeado = Math.round(valor * 100) / 100;

  // Modo broker: se publica y listo. Quien lo reenvia a Pangui es el agente.
  if (mqttClient) {
    const topic = `pangui/medidores/${token}/lectura`;
    mqttClient.publish(topic, String(redondeado), { qos: 1 });
    console.log(`#${String(n).padStart(3)} → ${redondeado}  ${topic}`);
    return;
  }

  try {
    const res = await fetch(`${URL_BASE}/api/medidores/lecturas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ valor: redondeado }),
    });
    const cuerpo = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`✗ ${res.status} ${cuerpo.error ?? "error"}`);
      // 401 no se arregla reintentando: el token está mal y cada reintento es
      // otra línea de ruido en la consola.
      if (res.status === 401) process.exit(1);
      return;
    }
    console.log(`#${String(n).padStart(3)} → ${redondeado}`);
  } catch (e) {
    console.error(`✗ sin conexión a ${URL_BASE} (${e.message})`);
  }
}

console.log(`Publicando en ${URL_BASE} cada ${cada}s. Ctrl+C para parar.\n`);
publicar();
setInterval(publicar, cada * 1000);
