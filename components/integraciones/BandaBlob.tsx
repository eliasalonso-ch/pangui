"use client";

/**
 * Nube de puntos animada (basada en "Blob" de Georgi Nikoloff) para la banda de
 * /integraciones/meconecta. WebGL2 sin librerías.
 *
 * ~70 mil puntos en espiral, desplazados con ruido simplex en el vertex shader.
 * El ruido se calcula en el espacio con la proporción real de la banda, para
 * que el movimiento no se vea estirado; la nube ocupa todo el alto y llega
 * hasta los logos.
 *
 * - Colores de marca: puntos azul Pangui del lado de Pangui y amarillo UdeC del
 *   lado de la UdeC, con una transición corta al centro.
 * - Nítido: puntos redondos en píxeles de dispositivo (DPR hasta 2).
 * - Con "reducir movimiento" dibuja un solo cuadro quieto. Se pausa fuera de
 *   pantalla y libera el contexto WebGL al desmontar. Sin WebGL2 no dibuja nada
 *   y queda el degradado de fondo de la banda.
 */

import { useEffect, useRef } from "react";

const SNOISE = `
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}`;

const VERT = `#version 300 es
uniform float u_time;
uniform float u_aspect;
uniform float u_dpr;
in vec2 a_position;
out float v_lado;
${SNOISE}
void main() {
  // a_position está en un disco unitario; w es el mismo punto con la proporción
  // real de la banda, donde se muestrea el ruido.
  vec2 w = vec2(a_position.x * u_aspect, a_position.y);
  float nx = snoise(w * 0.5 + u_time * 0.2) * 0.3;
  float ny = snoise(w * nx * 2.5 + u_time * 0.2) * 0.3;
  w += vec2(nx, ny);
  gl_Position = vec4(w.x / u_aspect, w.y, 0.0, 1.0);
  gl_PointSize = max(ny * 5.0 + 2.0, 0.75) * u_dpr;
  v_lado = gl_Position.x;
}`;

const FRAG = `#version 300 es
precision highp float;
uniform vec3 u_izq;
uniform vec3 u_der;
in float v_lado;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;               // puntos redondos
  vec3 col = mix(u_izq, u_der, smoothstep(-0.2, 0.2, v_lado));
  float a = 0.75;
  outColor = vec4(col * a, a);                 // alpha premultiplicado
}`;

const PUNTOS = 70_000;
const SIN_MOVIMIENTO = "(prefers-reduced-motion: reduce)";

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compilar(gl: WebGL2RenderingContext, tipo: number, fuente: string): WebGLShader | null {
  const s = gl.createShader(tipo);
  if (!s) return null;
  gl.shaderSource(s, fuente);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("BandaBlob:", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

export default function BandaBlob({ izquierda, derecha }: {
  /** Color de los puntos del lado de Pangui. */
  izquierda: string;
  /** Color de los puntos del lado de la UdeC. */
  derecha: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!canvas || !gl) return;

    const vs = compilar(gl, gl.VERTEX_SHADER, VERT);
    const fs = compilar(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("BandaBlob:", gl.getProgramInfoLog(prog));
      return;
    }

    // Espiral de 100 vueltas, radio creciente hasta 0.85 (como el original).
    const pos = new Float32Array(PUNTOS * 2);
    const paso = (Math.PI * 200) / PUNTOS;
    for (let i = 0; i < PUNTOS; i++) {
      const r = (i / PUNTOS) * 0.85;
      pos[i * 2] = Math.sin(i * paso) * r;
      pos[i * 2 + 1] = Math.cos(i * paso) * r;
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_position");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const u = {
      time: gl.getUniformLocation(prog, "u_time"),
      aspect: gl.getUniformLocation(prog, "u_aspect"),
      dpr: gl.getUniformLocation(prog, "u_dpr"),
      izq: gl.getUniformLocation(prog, "u_izq"),
      der: gl.getUniformLocation(prog, "u_der"),
    };
    gl.useProgram(prog);
    gl.uniform3fv(u.izq, rgb(izquierda));
    gl.uniform3fv(u.der, rgb(derecha));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    let dpr = 1;
    let t = 0;
    const dibujar = () => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.uniform1f(u.time, t);
      gl.uniform1f(u.aspect, canvas.width / Math.max(canvas.height, 1));
      gl.uniform1f(u.dpr, dpr);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.POINTS, 0, PUNTOS);
      gl.bindVertexArray(null);
    };

    const redimensionar = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      dibujar();
    };

    const mq = window.matchMedia(SIN_MOVIMIENTO);
    let visible = true;
    let raf = 0;
    let ultimo = 0;
    const cuadro = (ms: number) => {
      // Avanza con el tiempo real entre cuadros, así una pausa no produce un salto.
      if (ultimo) t += Math.min((ms - ultimo) / 1000, 0.1);
      ultimo = ms;
      dibujar();
      raf = requestAnimationFrame(cuadro);
    };
    const sincronizar = () => {
      const animar = visible && !mq.matches;
      if (animar && !raf) {
        ultimo = 0;
        raf = requestAnimationFrame(cuadro);
      } else if (!animar && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const ro = new ResizeObserver(redimensionar);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sincronizar(); });
    io.observe(canvas);
    mq.addEventListener("change", sincronizar);
    redimensionar();
    sincronizar();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mq.removeEventListener("change", sincronizar);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [izquierda, derecha]);

  return <canvas ref={ref} aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />;
}
