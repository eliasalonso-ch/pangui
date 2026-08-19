/**
 * Encuadre de una firma segun su proporcion.
 *
 * El movil captura la firma en un canvas a pantalla completa (`flex: 1` en
 * SignatureModalScreen), asi que en un telefono vertical la imagen sale alta y
 * angosta -- del orden de 0,5 de proporcion. La web la mostraba en una caja
 * apaisada fija de 200 px con `object-fit: contain`, y contain escala hasta que
 * quepa el lado mas restrictivo: una imagen vertical terminaba reducida a una
 * franja diminuta pegada a la izquierda.
 *
 * En vez de una altura fija, la caja se adapta a lo que realmente se recibio.
 * Se resuelve en el cliente para que sirva tambien con las firmas ya guardadas,
 * sin depender de recortarlas en origen.
 */

/** Proporcion (ancho/alto) desde la que una firma se considera apaisada. */
const UMBRAL_APAISADA = 1.6;

export type EncuadreFirma = {
  /** Alto en px de la caja que contiene la firma. */
  alto: number;
  /** Como posicionar la imagen dentro de la caja. */
  posicion: "left center" | "center";
};

/**
 * @param proporcion - ancho/alto de la imagen (`naturalWidth / naturalHeight`).
 *   `null` mientras no se conoce todavia.
 * @param altoBase - alto de la caja para una firma apaisada.
 */
export function encuadrarFirma(proporcion: number | null, altoBase: number): EncuadreFirma {
  // Sin medir aun: se usa el encuadre apaisado, que es el caso historico y el
  // que produce la web. Evita un salto de layout si resulta ser el correcto.
  if (proporcion === null || !Number.isFinite(proporcion) || proporcion <= 0) {
    return { alto: altoBase, posicion: "left center" };
  }

  if (proporcion >= UMBRAL_APAISADA) {
    // Firma ancha (canvas de escritorio): como estaba.
    return { alto: altoBase, posicion: "left center" };
  }

  // Firma vertical o casi cuadrada: se le da altura para que el trazo se lea.
  // El tope evita que una imagen muy alta empuje el resto del formulario fuera
  // de la pantalla; a partir de ahi contain la reduce, que es aceptable porque
  // ya tiene bastante alto util.
  const alto = Math.min(Math.round(altoBase / proporcion), altoBase * 2);

  // Centrada: una firma vertical alineada a la izquierda deja un vacio enorme a
  // la derecha y se lee como un error de maquetacion.
  return { alto, posicion: "center" };
}
