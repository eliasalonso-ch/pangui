/**
 * Cálculo tributario chileno para los cobros de Pangui.
 *
 * Pangui emite factura electrónica afecta a IVA (19%). Los precios del catálogo
 * (lib/flow-plans.ts) son BRUTOS: el monto que efectivamente se le cobra al
 * cliente ya incluye el IVA. Esa decisión es deliberada — al pasar de boleta de
 * honorarios a factura no se subió el precio a nadie, así que el IVA sale del
 * margen en vez de sumarse encima.
 *
 * REGLA CRÍTICA DE REDONDEO
 * -------------------------
 * El neto se obtiene dividiendo el bruto por 1.19 y el IVA es la RESTA, nunca
 * un segundo redondeo:
 *
 *     neto = round(bruto / 1.19)
 *     iva  = bruto - neto            ← resta, no round(neto * 0.19)
 *
 * Calcular el IVA por separado produce descuadres de $1 en los que
 * `neto + iva != bruto`, y una factura que no cuadra es rechazada por el SII.
 * Ejemplo real: bruto 4990 → neto 4193; round(4193 * 0.19) = 797 y 4193 + 797 =
 * 4990 ✓, pero bruto 9990 → neto 8395; round(8395 * 0.19) = 1595 → 9990 ✓,
 * mientras que bruto 6990 → neto 5874; round(5874 * 0.19) = 1116 → 6990 ✓.
 * Los tres cuadran por suerte, pero bruto 100 → neto 84; round(84 * 0.19) = 16
 * → 100 ✓ y bruto 1000 → neto 840; round(840 * 0.19) = 160 → 1000 ✓. El caso
 * que rompe: bruto 1990 → neto 1672; round(1672 * 0.19) = 318 → 1990 ✓. Como el
 * fallo depende del monto, la resta es la única forma de garantizar el cuadre
 * para CUALQUIER monto. Ver tests/lib/tributario.test.ts, que lo verifica
 * exhaustivamente de $1 a $2.000.000.
 *
 * El CLP no tiene decimales, así que todos los montos son enteros.
 */

/** Tasa de IVA vigente en Chile. */
export const TASA_IVA = 0.19;

/** Factor para pasar de bruto a neto. */
const FACTOR_BRUTO = 1 + TASA_IVA;

export interface DesgloseTributario {
  /** Monto neto (base imponible), en CLP sin decimales. */
  neto: number;
  /** IVA, en CLP sin decimales. Siempre `bruto - neto`. */
  iva: number;
  /** Total cobrado al cliente, en CLP sin decimales. */
  bruto: number;
}

/**
 * Descompone un monto bruto (IVA incluido) en neto + IVA.
 *
 * Invariante garantizada: `neto + iva === bruto` para cualquier entero >= 0.
 */
export function desglosarBruto(bruto: number): DesgloseTributario {
  if (!Number.isFinite(bruto)) throw new Error(`Monto bruto inválido: ${bruto}`);
  if (bruto < 0) throw new Error(`El monto bruto no puede ser negativo: ${bruto}`);

  const brutoEntero = Math.round(bruto);
  const neto = Math.round(brutoEntero / FACTOR_BRUTO);
  return { neto, iva: brutoEntero - neto, bruto: brutoEntero };
}

/**
 * Construye el desglose a partir de un monto neto conocido.
 *
 * Se usa cuando el precio de lista es neto (hoy no es el caso en Pangui, pero
 * un plan futuro o un cobro puntual podrían definirse así). Igual que arriba,
 * el IVA es una resta contra el bruto redondeado para que la suma cuadre.
 */
export function desglosarNeto(neto: number): DesgloseTributario {
  if (!Number.isFinite(neto)) throw new Error(`Monto neto inválido: ${neto}`);
  if (neto < 0) throw new Error(`El monto neto no puede ser negativo: ${neto}`);

  const netoEntero = Math.round(neto);
  const bruto = Math.round(netoEntero * FACTOR_BRUTO);
  return { neto: netoEntero, iva: bruto - netoEntero, bruto };
}

/**
 * Desglose de un cobro de suscripción: precio bruto por usuario × cantidad.
 *
 * El IVA se calcula sobre el TOTAL, no por usuario. Desglosar cada línea y
 * sumar los IVA individuales arrastra el error de redondeo tantas veces como
 * usuarios haya (con 7 usuarios a $9.990 la diferencia ya es de varios pesos),
 * y el total de la factura no cuadraría con la suma de sus líneas.
 */
export function desglosarCobroSuscripcion(
  precioBrutoPorUsuario: number,
  usuarios: number,
): DesgloseTributario {
  if (!Number.isInteger(usuarios) || usuarios < 0) {
    throw new Error(`Cantidad de usuarios inválida: ${usuarios}`);
  }
  return desglosarBruto(Math.round(precioBrutoPorUsuario) * usuarios);
}

/** Formatea un monto CLP para mostrarlo en la UI: 9990 → "$9.990". */
export function formatearCLP(monto: number): string {
  return monto.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

/**
 * Texto de desglose para la UI: "$9.990 (neto $8.395 + IVA $1.595)".
 * Un solo lugar que lo arma, para que la app no muestre dos formatos distintos.
 */
export function textoDesglose(bruto: number): string {
  const d = desglosarBruto(bruto);
  return `${formatearCLP(d.bruto)} (neto ${formatearCLP(d.neto)} + IVA ${formatearCLP(d.iva)})`;
}

// ── RUT ─────────────────────────────────────────────────────────────────────

/**
 * Normaliza un RUT a la forma canónica sin puntos y con guion: "12345678-9".
 * El dígito verificador se devuelve siempre en mayúscula ("K", no "k").
 */
export function normalizarRut(rut: string): string {
  const limpio = rut.replace(/[.\s]/g, "").replace(/-/g, "").toUpperCase();
  if (limpio.length < 2) return limpio;
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

/**
 * Calcula el dígito verificador de un RUT por el algoritmo módulo 11.
 * `cuerpo` es la parte numérica sin dígito verificador.
 */
export function digitoVerificador(cuerpo: string): string {
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

/**
 * Valida un RUT chileno incluyendo su dígito verificador.
 *
 * Se valida en el servidor antes de guardar el perfil de facturación: un RUT
 * mal tipeado no se descubre al guardar sino al emitir la factura, cuando el
 * SII la rechaza y el cobro ya ocurrió.
 */
export function rutEsValido(rut: string | null | undefined): boolean {
  if (!rut) return false;
  const normalizado = normalizarRut(rut);
  const match = normalizado.match(/^(\d{7,8})-([\dK])$/);
  if (!match) return false;
  return digitoVerificador(match[1]) === match[2];
}

/** Formatea un RUT para mostrarlo con puntos: "12345678-9" → "12.345.678-9". */
export function formatearRut(rut: string): string {
  const normalizado = normalizarRut(rut);
  const match = normalizado.match(/^(\d+)-([\dK])$/);
  if (!match) return rut;
  const cuerpo = match[1].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cuerpo}-${match[2]}`;
}
