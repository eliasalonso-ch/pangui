// ── Ayuda para escribir fórmulas en la hoja web ──────────────────────────────
// Catálogo de funciones (la guía fx y el autocompletar) y los cálculos sobre el
// texto que se escribe: qué función se está tipeando, en qué argumento va el
// cursor, dónde un clic en otra celda inserta su referencia y el F4 de los $.
// El cálculo en sí está en lib/hoja-formulas (compartido con la app); este
// archivo es solo de la web.
import { referencias } from "@/lib/hoja-formulas";

export type Funcion = {
  nombre: string;
  /** Argumentos como se leen en la firma: "[x]" opcional, "…" se repite. */
  args: string[];
  desc: string;
  grupo: (typeof GRUPOS)[number];
  /** Se calcula con la hoja de ejemplo de la guía (A Ítem, B Cantidad, C Precio). */
  ejemplo: string;
  /** Lo que da el ejemplo (si no cambia con el día ni con la hoja). Lo verifica el test. */
  resultado?: string;
};

export const GRUPOS = ["Básicas", "Números", "Condiciones", "Búsqueda", "Fechas", "Texto"] as const;

export const CATALOGO: Funcion[] = [
  { nombre: "SUMA", args: ["número1", "[número2]", "…"], desc: "Suma números o rangos", grupo: "Básicas", ejemplo: "=SUMA(1;2;3)", resultado: "6" },
  { nombre: "PROMEDIO", args: ["número1", "[número2]", "…"], desc: "Promedio de los números", grupo: "Básicas", ejemplo: "=PROMEDIO(2;4;9)", resultado: "5" },
  { nombre: "MIN", args: ["número1", "[número2]", "…"], desc: "El número más chico", grupo: "Básicas", ejemplo: "=MIN(4;2;8)", resultado: "2" },
  { nombre: "MAX", args: ["número1", "[número2]", "…"], desc: "El número más grande", grupo: "Básicas", ejemplo: "=MAX(4;2;8)", resultado: "8" },
  { nombre: "CONTAR", args: ["valor1", "[valor2]", "…"], desc: "Cuántas celdas tienen números", grupo: "Básicas", ejemplo: '=CONTAR(1;"a";3)', resultado: "2" },
  { nombre: "CONTARA", args: ["valor1", "[valor2]", "…"], desc: "Cuántas celdas no están vacías", grupo: "Básicas", ejemplo: '=CONTARA(1;"a";3)', resultado: "3" },
  { nombre: "PRODUCTO", args: ["número1", "[número2]", "…"], desc: "Multiplica todos los números", grupo: "Básicas", ejemplo: "=PRODUCTO(2;3;4)", resultado: "24" },

  { nombre: "REDONDEAR", args: ["número", "decimales"], desc: "Redondea a esos decimales", grupo: "Números", ejemplo: "=REDONDEAR(3,14159;2)", resultado: "3,14" },
  { nombre: "REDONDEAR.MAS", args: ["número", "decimales"], desc: "Redondea hacia arriba", grupo: "Números", ejemplo: "=REDONDEAR.MAS(2,31;1)", resultado: "2,4" },
  { nombre: "REDONDEAR.MENOS", args: ["número", "decimales"], desc: "Redondea hacia abajo", grupo: "Números", ejemplo: "=REDONDEAR.MENOS(2,39;1)", resultado: "2,3" },
  { nombre: "ENTERO", args: ["número"], desc: "La parte entera", grupo: "Números", ejemplo: "=ENTERO(7,8)", resultado: "7" },
  { nombre: "ABS", args: ["número"], desc: "El número sin signo", grupo: "Números", ejemplo: "=ABS(-5)", resultado: "5" },
  { nombre: "RAIZ", args: ["número"], desc: "Raíz cuadrada", grupo: "Números", ejemplo: "=RAIZ(16)", resultado: "4" },
  { nombre: "POTENCIA", args: ["número", "potencia"], desc: "Eleva a una potencia (igual que ^)", grupo: "Números", ejemplo: "=POTENCIA(2;10)", resultado: "1.024" },
  { nombre: "RESIDUO", args: ["número", "divisor"], desc: "El resto de la división", grupo: "Números", ejemplo: "=RESIDUO(10;3)", resultado: "1" },

  { nombre: "SI", args: ["condición", "si_se_cumple", "[si_no]"], desc: "Un valor u otro según la condición", grupo: "Condiciones", ejemplo: '=SI(B2>5;"Mucho";"Poco")', resultado: "Mucho" },
  { nombre: "Y", args: ["condición1", "[condición2]", "…"], desc: "VERDADERO si se cumplen todas", grupo: "Condiciones", ejemplo: "=Y(B2>5;C2<2000)", resultado: "VERDADERO" },
  { nombre: "O", args: ["condición1", "[condición2]", "…"], desc: "VERDADERO si se cumple alguna", grupo: "Condiciones", ejemplo: "=O(B2>50;C2<2000)", resultado: "VERDADERO" },
  { nombre: "NO", args: ["condición"], desc: "Invierte VERDADERO y FALSO", grupo: "Condiciones", ejemplo: "=NO(B2>50)", resultado: "VERDADERO" },
  { nombre: "SI.ERROR", args: ["valor", "si_hay_error"], desc: "Otro valor si la fórmula da error", grupo: "Condiciones", ejemplo: '=SI.ERROR(1/0;"—")', resultado: "—" },
  { nombre: "SUMAR.SI", args: ["rango", "criterio", "[rango_suma]"], desc: "Suma lo que cumple el criterio", grupo: "Condiciones", ejemplo: '=SUMAR.SI(B2:B4;">3")', resultado: "15" },
  { nombre: "CONTAR.SI", args: ["rango", "criterio"], desc: "Cuenta lo que cumple el criterio", grupo: "Condiciones", ejemplo: '=CONTAR.SI(A2:A4;"Caja")', resultado: "1" },
  { nombre: "PROMEDIO.SI", args: ["rango", "criterio", "[rango_promedio]"], desc: "Promedio de lo que cumple el criterio", grupo: "Condiciones", ejemplo: '=PROMEDIO.SI(B2:B4;">3")', resultado: "7,5" },

  { nombre: "BUSCARV", args: ["buscar", "tabla", "columna", "[aproximado]"], desc: "Busca en la 1ª columna de la tabla y trae otra columna de esa fila", grupo: "Búsqueda", ejemplo: '=BUSCARV("Caja";A2:C4;3;0)', resultado: "3.000" },

  { nombre: "HOY", args: [], desc: "La fecha de hoy", grupo: "Fechas", ejemplo: "=HOY()" },
  { nombre: "AHORA", args: [], desc: "La fecha y hora de ahora", grupo: "Fechas", ejemplo: "=AHORA()" },
  { nombre: "AÑO", args: ["fecha"], desc: "El año de una fecha", grupo: "Fechas", ejemplo: "=AÑO(HOY())" },
  { nombre: "MES", args: ["fecha"], desc: "El mes de una fecha (1 a 12)", grupo: "Fechas", ejemplo: "=MES(HOY())" },
  { nombre: "DIA", args: ["fecha"], desc: "El día del mes de una fecha", grupo: "Fechas", ejemplo: "=DIA(HOY())" },
  { nombre: "DIAS", args: ["fecha_final", "fecha_inicial"], desc: "Días entre dos fechas", grupo: "Fechas", ejemplo: "=DIAS(HOY()+30;HOY())", resultado: "30" },

  { nombre: "CONCATENAR", args: ["texto1", "[texto2]", "…"], desc: "Junta textos (igual que &)", grupo: "Texto", ejemplo: '=CONCATENAR(A2;" x ";B2)', resultado: "Cable x 10" },
  { nombre: "LARGO", args: ["texto"], desc: "Cuántos caracteres tiene", grupo: "Texto", ejemplo: '=LARGO("pangui")', resultado: "6" },
  { nombre: "MAYUSC", args: ["texto"], desc: "Todo en mayúsculas", grupo: "Texto", ejemplo: '=MAYUSC("hola")', resultado: "HOLA" },
  { nombre: "MINUSC", args: ["texto"], desc: "Todo en minúsculas", grupo: "Texto", ejemplo: '=MINUSC("HOLA")', resultado: "hola" },
  { nombre: "ESPACIOS", args: ["texto"], desc: "Quita los espacios de sobra", grupo: "Texto", ejemplo: '=ESPACIOS("  hola  ")', resultado: "hola" },
  { nombre: "IZQUIERDA", args: ["texto", "[cuántos]"], desc: "Los primeros caracteres", grupo: "Texto", ejemplo: '=IZQUIERDA("OT-1234";2)', resultado: "OT" },
  { nombre: "DERECHA", args: ["texto", "[cuántos]"], desc: "Los últimos caracteres", grupo: "Texto", ejemplo: '=DERECHA("OT-1234";4)', resultado: "1234" },
  { nombre: "EXTRAE", args: ["texto", "inicio", "cuántos"], desc: "Un trozo desde una posición", grupo: "Texto", ejemplo: '=EXTRAE("OT-1234";4;2)', resultado: "12" },
];

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const POR_NOMBRE = new Map(CATALOGO.map((f) => [sinTildes(f.nombre), f]));
export const funcionPorNombre = (nombre: string) => POR_NOMBRE.get(sinTildes(nombre));

const LETRA = "A-Za-zÑñÁÉÍÓÚáéíóú";
// Antes de un nombre de función o de una referencia: inicio, operador, paréntesis o ";".
const ANTES_DE_ALGO = /[=(;+\-*/^&<>:\s]/;
// Comillas abiertas antes del cursor: se está escribiendo un texto, no una fórmula.
const enTexto = (antes: string) => (antes.split('"').length - 1) % 2 === 1;

/** El nombre de función que se está escribiendo justo antes del cursor, o null. */
export function funcionEscribiendo(texto: string, caret: number): { inicio: number; prefijo: string } | null {
  if (!texto.startsWith("=")) return null;
  const antes = texto.slice(0, caret);
  if (enTexto(antes)) return null;
  const m = new RegExp(`[${LETRA}][${LETRA}.]*$`).exec(antes);
  if (!m || !ANTES_DE_ALGO.test(antes[m.index - 1] ?? "")) return null;
  return { inicio: m.index, prefijo: m[0] };
}

export function buscarFunciones(prefijo: string, max = 8): Funcion[] {
  const p = sinTildes(prefijo);
  return CATALOGO.filter((f) => sinTildes(f.nombre).startsWith(p)).slice(0, max);
}

/** Reemplaza lo escrito por "NOMBRE(" (o "HOY()" si no lleva argumentos). */
export function completarFuncion(texto: string, caret: number, f: Funcion): { texto: string; caret: number } {
  const inicio = funcionEscribiendo(texto, caret)?.inicio ?? caret;
  const pone = f.args.length ? `${f.nombre}(` : `${f.nombre}()`;
  return { texto: texto.slice(0, inicio) + pone + texto.slice(caret), caret: inicio + pone.length };
}

/** La función del catálogo cuyo paréntesis contiene al cursor, y en qué argumento va (desde 0). */
export function argumentoActual(texto: string, caret: number): { nombre: string; indice: number } | null {
  if (!texto.startsWith("=")) return null;
  const pila: { nombre: string; indice: number }[] = [];
  let comillas = false;
  for (let i = 1; i < caret; i++) {
    const ch = texto[i];
    if (ch === '"') comillas = !comillas;
    if (comillas) continue;
    if (ch === "(") {
      const nombre = new RegExp(`[${LETRA}][${LETRA}0-9.]*\\s*$`).exec(texto.slice(1, i))?.[0].trim() ?? "";
      pila.push({ nombre, indice: 0 });
    } else if (ch === ")") pila.pop();
    else if (ch === ";" && pila.length) pila[pila.length - 1].indice++;
  }
  // Dentro de un paréntesis suelto, "(1+2", vale la función de afuera.
  for (let i = pila.length - 1; i >= 0; i--) {
    const f = funcionPorNombre(pila[i].nombre);
    if (f) return { nombre: f.nombre, indice: pila[i].indice };
  }
  return null;
}

/** Un clic en otra celda inserta su referencia (en vez de cerrar la celda) solo aquí. */
export function puedeApuntar(texto: string, caret: number): boolean {
  if (!texto.startsWith("=")) return false;
  const antes = texto.slice(0, caret);
  return !enTexto(antes) && ANTES_DE_ALGO.test(antes.slice(-1));
}

/** F4: la referencia bajo el cursor rota B2 → $B$2 → B$2 → $B2 → B2 (en un rango, las dos puntas). */
export function alternarAbsoluta(texto: string, caret: number): { texto: string; caret: number } | null {
  const ref = referencias(texto).find((r) => r.inicio <= caret && caret <= r.fin);
  if (!ref) return null;
  const tramo = texto.slice(ref.inicio, ref.fin);
  const [, colAbs, , filaAbs] = /(\$?)([A-Za-z]{1,3})(\$?)(\d+)/.exec(tramo)!;
  // Estado actual → siguiente, como en Excel.
  const [c, f] = !colAbs && !filaAbs ? [true, true] : colAbs && filaAbs ? [false, true] : !colAbs ? [true, false] : [false, false];
  const nuevo = tramo.replace(/\$?([A-Za-z]{1,3})\$?(\d+)/g, (_, l: string, n: string) => `${c ? "$" : ""}${l}${f ? "$" : ""}${n}`);
  return { texto: texto.slice(0, ref.inicio) + nuevo + texto.slice(ref.fin), caret: ref.inicio + nuevo.length };
}

const ERRORES: Record<string, string> = {
  "#DIV/0!": "División por cero",
  "#¡REF!": "Referencia circular, o a una celda que no existe",
  "#¿NOMBRE?": "No existe una función con ese nombre",
  "#¡VALOR!": "Un valor no es del tipo que pide la fórmula (¿texto donde va un número?)",
  "#¡ERROR!": "La fórmula está mal escrita",
  "#¡NUM!": "Número inválido o demasiado grande",
  "#N/A": "No se encontró lo que se buscaba",
  "#¡NULO!": "Los rangos no se cruzan",
};
export const explicarError = (codigo: string) => ERRORES[codigo] ?? "No se puede calcular";
