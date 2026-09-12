# Demo: ESP32 simulado → Pangui

Un ESP32 que lee un "sensor de vibración" y publica en Pangui. Corre en
[wokwi.com](https://wokwi.com) sin comprar nada, y el mismo código funciona
tal cual en un ESP32 físico.

Sirve para mostrarle a un cliente —o a un fabricante de sensores— el camino
completo: sensor → equipo → Pangui → orden de trabajo.

## Requisito

**La app tiene que estar desplegada en una URL pública.** El gateway gratuito
de Wokwi sale a internet pero no alcanza `localhost`. Si la demo es en tu
laptop sin internet, usa `scripts/simular-medidor.js` en su lugar.

## Armado (5 minutos)

1. Entra a [wokwi.com](https://wokwi.com) → **New Project** → **ESP32**
2. Pega `sketch.ino` en la pestaña del mismo nombre
3. Abre la pestaña `diagram.json` y pega el contenido de este archivo
4. En `sketch.ino` cambia dos líneas:
   - `PANGUI_URL` → tu dominio (sin barra final)
   - `TOKEN` → el token del medidor, desde la ficha del activo → **Copiar**
5. **Play** (▶)

## La demo

En pantalla queda un ESP32 con una perilla (el sensor) y un LED rojo.

| Acción | Qué pasa |
|---|---|
| Arranca | El monitor serial muestra `2.31 mm/s → HTTP 200` cada 3 s |
| Miras Pangui | El panel **Lecturas de medidores** se mueve solo |
| Giras la perilla a la mitad | Pasa la advertencia: el número se pone ámbar |
| La giras hasta el tope | Pasa la alarma: LED rojo **y aparece la OT sola** |

La perilla es a propósito: en una reunión conviene **provocar** la falla cuando
uno quiere, no esperar que una rampa llegue sola.

## Lo que conviene decir mientras corre

- El firmware son ~40 líneas y **no decide nada**: manda el número y ya.
- El umbral vive en Pangui, en la ficha del medidor. Cambiarlo **no** requiere
  tocar el equipo — que es justamente el problema de los sistemas donde la
  alarma está quemada en el PLC.
- El equipo se autentica con **su propio token**, revocable desde la ficha sin
  afectar a los demás.
- Lo que ven en pantalla es literalmente lo que haría su sensor.

## Con hardware real

El mismo `sketch.ino` compila para un ESP32 físico. Solo cambia:

- `WIFI_SSID` / `WIFI_PASS` por la red real
- `PIN_SENSOR` por la entrada donde esté el acelerómetro

Para un sensor industrial de 4–20 mA hace falta una etapa de acondicionamiento
(resistencia de shunt + ADC), pero el código de red no cambia.

## Si no funciona

| Síntoma | Causa |
|---|---|
| `HTTP -1` | La URL no es pública, o tiene barra final |
| `HTTP 401` | Token mal copiado, o el medidor es de tipo Manual (esos no llevan token) |
| `HTTP 400` | El cuerpo no es JSON válido — revisa que no falte una comilla |
| Llega pero no abre OT | El medidor no tiene umbral `crítico`, o no está asociado a un activo, o ya hay una OT abierta de ese medidor (el dedupe es intencional) |
