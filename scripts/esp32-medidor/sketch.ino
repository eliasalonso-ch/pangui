/*
 * Medidor de vibración con ESP32 — firmware de demo.
 *
 * Corre tal cual en https://wokwi.com (ESP32 simulado, con WiFi de verdad hacia
 * internet) y también en un ESP32 físico sin cambiar una línea: Wokwi ejecuta
 * el mismo Arduino core.
 *
 * PARA LA DEMO EN WOKWI:
 *   1. wokwi.com → New Project → ESP32
 *   2. Pegar este archivo en sketch.ino y diagram.json en su pestaña
 *   3. Cambiar TOKEN por el del medidor (ficha del activo → Copiar)
 *   4. Cambiar PANGUI_URL por tu dominio público
 *   5. Play. El potenciómetro de la pantalla es el "sensor": al subirlo, sube
 *      la vibración, y al pasar el umbral Pangui abre la OT sola.
 *
 * OJO: el gateway gratuito de Wokwi NO alcanza localhost. La app tiene que
 * estar desplegada en una URL pública (o usar el Private Gateway, que es pago).
 *
 * El potenciómetro en vez de un valor aleatorio es a propósito: en una reunión
 * uno quiere PROVOCAR la falla cuando lo decide, no esperar a que la rampa
 * llegue. Girar la perilla y ver aparecer la orden de trabajo es la demo.
 */

#include <WiFi.h>
#include <HTTPClient.h>

// ── Configuración ───────────────────────────────────────────────────────────
const char* WIFI_SSID = "Wokwi-GUEST";   // red del simulador; sin clave
const char* WIFI_PASS = "";

// Sin barra final.
const char* PANGUI_URL = "https://TU-DOMINIO.vercel.app";

// Token del medidor (tipo "Automatizado"). Sale de la ficha del activo.
const char* TOKEN = "pang_mtr_PEGA_AQUI_TU_TOKEN";

const int PIN_SENSOR = 34;        // ADC1_CH6: entrada analógica del "sensor"
const int PIN_LED = 2;            // LED rojo: se enciende al pasar la alarma
const int INTERVALO_MS = 3000;    // cada cuánto se publica una lectura

// Escala: el ADC entrega 0..4095 y lo mapeamos a mm/s de vibración.
// 0..12 mm/s cubre de una máquina sana a una en falla clara (ISO 10816 pone
// el límite de "inaceptable" cerca de 7 mm/s para motores medianos).
const float VIB_MAX = 12.0;

// Copia local del umbral, SOLO para encender el LED de la maqueta. La decisión
// que importa —abrir la orden de trabajo— la toma Pangui con el umbral que el
// cliente configuró en la ficha; el equipo no decide nada. Tenerlo acá también
// haría que cambiar el umbral obligara a reprogramar el firmware, que es
// justamente lo que no se quiere.
const float UMBRAL_LED = 7.0;

void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);

  Serial.print("Conectando a WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Conectado. IP: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  // El potenciómetro hace de sensor: girarlo es "la máquina se está rompiendo".
  int bruto = analogRead(PIN_SENSOR);
  float vibracion = (bruto / 4095.0) * VIB_MAX;

  // Dos decimales: más precisión que esa es ruido del ADC, no de la máquina.
  vibracion = roundf(vibracion * 100) / 100.0;

  digitalWrite(PIN_LED, vibracion >= UMBRAL_LED ? HIGH : LOW);

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Sin WiFi; se omite el envío.");
    delay(INTERVALO_MS);
    return;
  }

  HTTPClient http;
  String url = String(PANGUI_URL) + "/api/medidores/lecturas";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + TOKEN);

  // El endpoint acepta {"valor": n} o un arreglo. Acá va una sola lectura.
  String body = String("{\"valor\": ") + String(vibracion, 2) + "}";

  int codigo = http.POST(body);

  Serial.print(vibracion, 2);
  Serial.print(" mm/s  →  HTTP ");
  Serial.print(codigo);
  if (codigo > 0) {
    Serial.print("  ");
    Serial.print(http.getString());
  }
  Serial.println();

  http.end();
  delay(INTERVALO_MS);
}
