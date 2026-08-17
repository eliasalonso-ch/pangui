/**
 * Regiones y comunas de Chile (división político-administrativa vigente).
 *
 * 16 regiones y 346 comunas. Los nombres de región usan la forma que aparece
 * en los formularios del SII, no la constitucional completa ("Biobío", no
 * "Región del Biobío").
 *
 * La factura electrónica identifica la dirección del receptor por comuna, y un
 * nombre mal escrito es un dato malo en un documento tributario. Por eso el
 * formulario ofrece la lista en vez de texto libre.
 *
 * Sobre "ciudad": no existe una lista oficial cerrada de ciudades en Chile, y
 * en la mayoría de las direcciones comerciales coincide con la comuna. El
 * formulario la autocompleta con la comuna elegida y la deja editable para los
 * casos donde difieren (p. ej. comuna Coronel, ciudad Concepción si el cliente
 * lo prefiere). Deliberadamente NO se infiere un mapeo comuna→ciudad: sería
 * adivinar en cientos de casos sin respuesta única.
 */

export interface Region {
  nombre:  string;
  /** Número romano de la región; "RM" para la Metropolitana. */
  numero:  string;
  comunas: readonly string[];
}

export const REGIONES: readonly Region[] = [
  {
    nombre: "Arica y Parinacota",
    numero: "XV",
    comunas: ["Arica", "Camarones", "General Lagos", "Putre"],
  },
  {
    nombre: "Tarapacá",
    numero: "I",
    comunas: ["Alto Hospicio", "Camiña", "Colchane", "Huara", "Iquique", "Pica", "Pozo Almonte"],
  },
  {
    nombre: "Antofagasta",
    numero: "II",
    comunas: [
      "Antofagasta", "Calama", "María Elena", "Mejillones", "Ollagüe",
      "San Pedro de Atacama", "Sierra Gorda", "Taltal", "Tocopilla",
    ],
  },
  {
    nombre: "Atacama",
    numero: "III",
    comunas: [
      "Alto del Carmen", "Caldera", "Chañaral", "Copiapó", "Diego de Almagro",
      "Freirina", "Huasco", "Tierra Amarilla", "Vallenar",
    ],
  },
  {
    nombre: "Coquimbo",
    numero: "IV",
    comunas: [
      "Andacollo", "Canela", "Combarbalá", "Coquimbo", "Illapel", "La Higuera",
      "La Serena", "Los Vilos", "Monte Patria", "Ovalle", "Paihuano", "Punitaqui",
      "Río Hurtado", "Salamanca", "Vicuña",
    ],
  },
  {
    nombre: "Valparaíso",
    numero: "V",
    comunas: [
      "Algarrobo", "Cabildo", "Calera", "Calle Larga", "Cartagena", "Casablanca",
      "Catemu", "Concón", "El Quisco", "El Tabo", "Hijuelas", "Isla de Pascua",
      "Juan Fernández", "La Cruz", "La Ligua", "Limache", "Llaillay", "Los Andes",
      "Nogales", "Olmué", "Panquehue", "Papudo", "Petorca", "Puchuncaví",
      "Putaendo", "Quillota", "Quilpué", "Quintero", "Rinconada", "San Antonio",
      "San Esteban", "San Felipe", "Santa María", "Santo Domingo", "Valparaíso",
      "Villa Alemana", "Viña del Mar", "Zapallar",
    ],
  },
  {
    nombre: "Metropolitana de Santiago",
    numero: "RM",
    comunas: [
      "Alhué", "Buin", "Calera de Tango", "Cerrillos",
      "Cerro Navia", "Colina", "Conchalí", "Curacaví", "El Bosque", "El Monte",
      "Estación Central", "Huechuraba", "Independencia", "Isla de Maipo",
      "La Cisterna", "La Florida", "La Granja", "La Pintana", "La Reina",
      "Lampa", "Las Condes", "Lo Barnechea", "Lo Espejo", "Lo Prado", "Macul",
      "Maipú", "María Pinto", "Melipilla", "Ñuñoa", "Padre Hurtado", "Paine",
      "Pedro Aguirre Cerda", "Peñaflor", "Peñalolén", "Pirque", "Providencia",
      "Pudahuel", "Puente Alto", "Quilicura", "Quinta Normal", "Recoleta",
      "Renca", "San Bernardo", "San Joaquín", "San José de Maipo", "San Miguel",
      "San Pedro", "San Ramón", "Santiago", "Talagante", "Tiltil", "Vitacura",
    ],
  },
  {
    nombre: "Libertador General Bernardo O'Higgins",
    numero: "VI",
    comunas: [
      "Chépica", "Chimbarongo", "Codegua", "Coinco", "Coltauco", "Doñihue",
      "Graneros", "La Estrella", "Las Cabras", "Litueche", "Lolol", "Machalí",
      "Malloa", "Marchigüe", "Mostazal", "Nancagua", "Navidad", "Olivar", "Palmilla",
      "Paredones", "Peralillo", "Peumo", "Pichidegua", "Pichilemu", "Placilla",
      "Pumanque", "Quinta de Tilcoco", "Rancagua", "Rengo", "Requínoa",
      "San Fernando", "San Vicente", "Santa Cruz",
    ],
  },
  {
    nombre: "Maule",
    numero: "VII",
    comunas: [
      "Cauquenes", "Chanco", "Colbún", "Constitución", "Curepto", "Curicó",
      "Empedrado", "Hualañé", "Licantén", "Linares", "Longaví", "Maule",
      "Molina", "Parral", "Pelarco", "Pelluhue", "Pencahue", "Rauco", "Retiro",
      "Río Claro", "Romeral", "Sagrada Familia", "San Clemente", "San Javier",
      "San Rafael", "Talca", "Teno", "Vichuquén", "Villa Alegre", "Yerbas Buenas",
    ],
  },
  {
    nombre: "Ñuble",
    numero: "XVI",
    comunas: [
      "Bulnes", "Chillán", "Chillán Viejo", "Cobquecura", "Coelemu", "Coihueco",
      "El Carmen", "Ninhue", "Ñiquén", "Pemuco", "Pinto", "Portezuelo",
      "Quillón", "Quirihue", "Ránquil", "San Carlos", "San Fabián", "San Ignacio",
      "San Nicolás", "Treguaco", "Yungay",
    ],
  },
  {
    nombre: "Biobío",
    numero: "VIII",
    comunas: [
      "Alto Biobío", "Antuco", "Arauco", "Cabrero", "Cañete", "Chiguayante",
      "Concepción", "Contulmo", "Coronel", "Curanilahue", "Florida", "Hualpén",
      "Hualqui", "Laja", "Lebu", "Los Álamos", "Los Ángeles", "Lota", "Mulchén",
      "Nacimiento", "Negrete", "Penco", "Quilaco", "Quilleco", "San Pedro de la Paz",
      "San Rosendo", "Santa Bárbara", "Santa Juana", "Talcahuano", "Tirúa",
      "Tomé", "Tucapel", "Yumbel",
    ],
  },
  {
    nombre: "La Araucanía",
    numero: "IX",
    comunas: [
      "Angol", "Carahue", "Cholchol", "Collipulli", "Cunco", "Curacautín",
      "Curarrehue", "Ercilla", "Freire", "Galvarino", "Gorbea", "Lautaro",
      "Loncoche", "Lonquimay", "Los Sauces", "Lumaco", "Melipeuco", "Nueva Imperial",
      "Padre Las Casas", "Perquenco", "Pitrufquén", "Pucón", "Purén", "Renaico",
      "Saavedra", "Temuco", "Teodoro Schmidt", "Toltén", "Traiguén", "Victoria",
      "Vilcún", "Villarrica",
    ],
  },
  {
    nombre: "Los Ríos",
    numero: "XIV",
    comunas: [
      "Corral", "Futrono", "La Unión", "Lago Ranco", "Lanco", "Los Lagos",
      "Máfil", "Mariquina", "Paillaco", "Panguipulli", "Río Bueno", "Valdivia",
    ],
  },
  {
    nombre: "Los Lagos",
    numero: "X",
    comunas: [
      "Ancud", "Calbuco", "Castro", "Chaitén", "Chonchi", "Cochamó", "Curaco de Vélez",
      "Dalcahue", "Fresia", "Frutillar", "Futaleufú", "Hualaihué", "Llanquihue",
      "Los Muermos", "Maullín", "Osorno", "Palena", "Puerto Montt", "Puerto Octay",
      "Puerto Varas", "Puqueldón", "Purranque", "Puyehue", "Queilén", "Quellón",
      "Quemchi", "Quinchao", "Río Negro", "San Juan de la Costa", "San Pablo",
    ],
  },
  {
    nombre: "Aysén del General Carlos Ibáñez del Campo",
    numero: "XI",
    comunas: [
      "Aysén", "Chile Chico", "Cisnes", "Cochrane", "Coyhaique", "Guaitecas",
      "Lago Verde", "O'Higgins", "Río Ibáñez", "Tortel",
    ],
  },
  {
    nombre: "Magallanes y de la Antártica Chilena",
    numero: "XII",
    comunas: [
      "Antártica", "Cabo de Hornos", "Laguna Blanca", "Natales", "Porvenir",
      "Primavera", "Punta Arenas", "Río Verde", "San Gregorio", "Timaukel",
      "Torres del Paine",
    ],
  },
];

/** Nombres de región, en el orden geográfico norte → sur de REGIONES. */
export const NOMBRES_REGIONES: readonly string[] = REGIONES.map(r => r.nombre);

/** Quita tildes, baja a minúsculas y colapsa espacios, para comparar nombres. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Devuelve el nombre canónico de una comuna a partir de una escritura
 * aproximada, o null si no existe.
 *
 * Los perfiles guardados antes de que el formulario usara la lista oficial
 * tienen la comuna escrita a mano, muchas veces sin tilde ("Concepcion").
 * Sin esta normalización el `<select>` no encontraba la opción y mostraba el
 * campo vacío, como si el dato se hubiera perdido.
 */
export function comunaCanonica(comuna: string | null | undefined): string | null {
  if (!comuna) return null;
  const buscado = normalizar(comuna);
  for (const region of REGIONES) {
    const hallada = region.comunas.find(c => normalizar(c) === buscado);
    if (hallada) return hallada;
  }
  return null;
}

/** Igual que `comunaCanonica`, para el nombre de la región. */
export function regionCanonica(region: string | null | undefined): string | null {
  if (!region) return null;
  const buscado = normalizar(region);
  return REGIONES.find(r => normalizar(r.nombre) === buscado)?.nombre ?? null;
}

/** Comunas de una región. Lista vacía si el nombre no corresponde a ninguna. */
export function comunasDeRegion(region: string | null | undefined): readonly string[] {
  if (!region) return [];
  const canonica = regionCanonica(region);
  return REGIONES.find(r => r.nombre === canonica)?.comunas ?? [];
}

/** La región a la que pertenece una comuna, o null si no existe. */
export function regionDeComuna(comuna: string | null | undefined): string | null {
  const canonica = comunaCanonica(comuna);
  if (!canonica) return null;
  return REGIONES.find(r => r.comunas.includes(canonica))?.nombre ?? null;
}

/** ¿La comuna pertenece a la región indicada? Tolera tildes y mayúsculas. */
export function comunaPerteneceARegion(comuna: string, region: string): boolean {
  const canonica = comunaCanonica(comuna);
  return canonica !== null && comunasDeRegion(region).includes(canonica);
}

/** Todas las comunas del país, ordenadas alfabéticamente. */
export const TODAS_LAS_COMUNAS: readonly string[] =
  REGIONES.flatMap(r => r.comunas).sort((a, b) => a.localeCompare(b, "es"));
