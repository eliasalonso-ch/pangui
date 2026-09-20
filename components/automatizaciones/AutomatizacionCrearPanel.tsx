"use client";

/**
 * Constructor de una automatización: Cuando pase esto → Sólo si además → Haz esto.
 *
 * Es un constructor de reglas disparador-condición-acción, el patrón de Zapier
 * / HubSpot / UpKeep: los pasos se apilan en una columna con un espinazo a la
 * izquierda —icono por paso, línea punteada entre ellos— y cada paso es una
 * tarjeta con encabezado propio. Lineal a propósito y no un lienzo de nodos:
 * la regla no se ramifica, así que un grafo sería cuerda de más.
 *
 * Mismo armazón que el resto de los paneles (`PanelCatalogo`), porque esto
 * ocupa el panel derecho del master-detail y no un modal: entre disparadores,
 * los campos de la OT y los dos frenos, el formulario es largo.
 *
 * v1 ofrece una sola acción, `crear_ot`. El enum de la base acepta cuatro, pero
 * el motor solo implementa esta, así que el constructor no la deja elegir:
 * ofrecer una acción que no hace nada es peor que no ofrecerla.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Box, Check, ChevronDown, ChevronRight, Clock, File, FileText, Flag, Gauge, GitBranch,
  Image as ImageIcon, Inbox,
  Lock, MapPin, Paperclip, Play, Plus, Settings, Settings2, SlidersHorizontal, Tag,
  Trash2, User, X,
} from "lucide-react";
import SearchSelect from "@/components/activos/SearchSelect";
import AssigneeSelect from "@/components/ordenes/AssigneeSelect";
import CategoriaMultiSelect from "@/components/ordenes/CategoriaMultiSelect";
import CuadrillaQuickAdd from "@/components/ordenes/CuadrillaQuickAdd";
import ProcedimientosPicker, { type ProcedimientoSeleccionado } from "@/app/(app)/ordenes/ProcedimientosPicker";
import { uploadToR2 } from "@/lib/r2";
import { createClient } from "@/lib/supabase";
import {
  FieldRow, inputStyle, textareaStyle, seccionDetalle, tituloInputStyle, PanelCatalogo,
} from "@/components/catalogo/PanelCatalogo";
import {
  agruparTriggersPorMedidor, condicionesDisponibles, createAutomatizacion, updateAutomatizacion,
  esAcumulado, esDelta, medidorTrasCambiarActivo, MODOS, OPERADORES,
  operadoresDisponibles, proximoDisparoDisponible,
  CRITICIDADES, DIAS_SEMANA, ESTADOS_ACTIVO, TIPOS_ACCION, TIPOS_CONDICION,
  type AutomatizacionCompleta, type ConfigCambiarEstado, type ConfigCrearOT,
  type CondicionConfig, type EstadoActivo, type OperadorTrigger, type ModoTrigger,
  type TipoAccion, type TipoCondicion,
} from "@/lib/automatizaciones-api";
import {
  createMotivoInactividad, fetchMotivosInactividad,
  type MotivoInactividad, type TipoInactividad,
} from "@/lib/activo-estado-api";
import type { MedidorConUltima } from "@/lib/medidores-api";
import type { AssetCriticality, AssetStatus, CategoriaOT, OTLink, Usuario } from "@/types/ordenes";

/**
 * Los mismos cinco de OTCrearPanel y en el mismo orden.
 *
 * `tipo_trabajo` siempre fue una clave que el motor lee —cae en 'reactiva' si
 * falta—, pero el constructor no la exponía: toda OT automatizada nacía
 * reactiva sin que nadie lo hubiera elegido. Una regla de mantenimiento por
 * horas de uso es preventiva, no reactiva.
 */
const TIPOS_TRABAJO: { value: string; label: string }[] = [
  { value: "reactiva",      label: "Reactiva" },
  { value: "preventiva",    label: "Preventiva" },
  { value: "emergencia",    label: "Emergencia" },
  { value: "presupuesto",   label: "Presupuesto" },
  { value: "levantamiento", label: "Levantamiento" },
];

/** Las cinco de Pangui. La referencia muestra cuatro; manda Pangui. */
const PRIORIDADES: { value: string; label: string; activeColor: string }[] = [
  { value: "ninguna", label: "Ninguna", activeColor: "var(--fg-3)" },
  { value: "baja",    label: "Baja",    activeColor: "var(--fg-3)" },
  { value: "media",   label: "Media",   activeColor: "var(--brand)" },
  { value: "alta",    label: "Alta",    activeColor: "var(--warning)" },
  { value: "urgente", label: "Urgente", activeColor: "var(--danger)" },
];

/**
 * Estados a los que puede pasar la acción. `baja` queda fuera por lo mismo que
 * en CambiarEstadoDialog: retirar un activo es la acción "Eliminar", y tener
 * dos caminos con el mismo significado se contradice. Sigue siendo válido en
 * la base para no invalidar filas históricas.
 */
const ESTADOS_DESTINO: { value: AssetStatus; label: string }[] = [
  { value: "operativo",      label: "Operativo" },
  { value: "mantencion",     label: "En mantención" },
  { value: "fuera_servicio", label: "Fuera de servicio" },
];

const labelStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 500, color: "var(--fg-1)", marginBottom: 10, display: "block",
};

/**
 * Un paso del espinazo: medallón con icono a la izquierda, contenido a la
 * derecha, y una línea punteada que baja del medallón hasta el paso siguiente.
 *
 * La línea es un borde izquierdo en la columna del medallón y no un pseudo-
 * elemento, porque estos estilos son objetos inline y no hay hoja donde
 * declarar `::after`. El último paso la apaga con `ultimo`.
 */
export function Paso({ icono, titulo, ultimo, children }: {
  icono: React.ReactNode;
  titulo: string;
  ultimo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
      <div style={{ width: 32, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
          border: "1px solid var(--border)", background: "var(--surface-1)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--fg-3)",
        }}>
          {icono}
        </div>
        {!ultimo && (
          <div style={{ flex: 1, width: 0, borderLeft: "1px dashed var(--border)", marginTop: 4 }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: ultimo ? 0 : 22 }}>
        <div style={{ ...labelStyle, marginBottom: 12, lineHeight: "32px" }}>{titulo}</div>
        {children}
      </div>
    </div>
  );
}

/** Tarjeta de un paso: encabezado teñido con el título y sus controles. */
export function Tarjeta({ titulo, subtitulo, icono, acciones, abierta, onToggle, children }: {
  titulo: string;
  /** Segunda línea del encabezado, para decir qué hay dentro sin abrir. */
  subtitulo?: string;
  icono?: React.ReactNode;
  acciones?: React.ReactNode;
  /** Con `onToggle`, el encabezado pliega y despliega la tarjeta. */
  abierta?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
}) {
  return (
    // Sin `overflow: hidden`: recortaría el desplegable del SearchSelect, que es
    // `position: absolute` y sale de la tarjeta. Un ancestro con overflow oculto
    // recorta a sus descendientes absolutos por más z-index que lleven, así que
    // el encabezado redondea sus propias esquinas de arriba en vez de heredarlo.
    <div style={{
      border: "1px solid var(--border)", borderRadius: "var(--r-md)",
      background: "var(--surface-1)",
    }}>
      {/* El encabezado va en celeste y no en gris: es el renglón que dice qué
          hace este paso ("Cuando llegue una lectura del medidor"), así que al
          recorrer la regla de arriba abajo se leen los encabezados y se entiende
          sola.

          `--row-selected` (#fafdff) es el mismo celeste de una tarjeta
          seleccionada en las listas, y se usa el token y no el hex a mano porque
          en modo oscuro vale otra cosa. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        minHeight: 52, padding: "12px 14px",
        background: "var(--row-selected)",
        // El borde separa el encabezado de su cuerpo, así que sin cuerpo sobra:
        // plegada, la tarjeta es solo el encabezado y la línea quedaba colgando
        // contra el borde de la propia tarjeta.
        borderBottom: children ? "1px solid var(--border)" : "none",
        borderRadius: children ? "var(--r-md) var(--r-md) 0 0" : "var(--r-md)",
      }}>
        {/* El chevron va primero del todo, antes del icono de la tarjeta: es el
            control que pliega, y en el borde izquierdo se encuentra de una. En
            negro y a 18px porque en gris claro se perdía contra el celeste del
            encabezado. */}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={abierta}
            aria-label={abierta ? "Plegar" : "Desplegar"}
            style={{
              flexShrink: 0, display: "flex", alignItems: "center",
              background: "none", border: "none", padding: 0, cursor: "pointer",
            }}
          >
            <ChevronDown
              size={18}
              strokeWidth={2.5}
              style={{
                color: "var(--fg-1)",
                transform: abierta ? "none" : "rotate(-90deg)",
                transition: "transform 0.15s",
              }}
            />
          </button>
        )}

        {icono && <span style={{ display: "flex", color: "var(--brand)" }}>{icono}</span>}

        {/* El título también pliega: es la zona grande y evidente, y así no hay
            que apuntarle al chevron. Sin `onToggle` es un encabezado normal. */}
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={abierta}
            style={{
              flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8,
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontFamily: "inherit", textAlign: "left",
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--fg-1)" }}>
                {titulo}
              </span>
              {subtitulo && (
                <span style={{
                  display: "block", fontSize: 13, color: "var(--fg-4)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {subtitulo}
                </span>
              )}
            </span>
          </button>
        ) : (
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, color: "var(--fg-1)" }}>{titulo}</span>
        )}
        {acciones}
      </div>
      {children && <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>}
    </div>
  );
}

/** Botón fantasma de borde punteado, para agregar un paso más a la regla. */
function BotonAgregar({ icono, children, onClick, deshabilitado, titulo }: {
  icono?: React.ReactNode;
  children: React.ReactNode;
  /** Recibe el evento, igual que BotonIcono, para poder anclarle un globo. */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  deshabilitado?: boolean;
  titulo?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      title={titulo}
      style={{
        width: "100%", height: 44, display: "flex", alignItems: "center",
        justifyContent: "center", gap: 8,
        border: "1px dashed var(--border)", borderRadius: "var(--r-md)",
        background: "none", fontFamily: "inherit", fontSize: 14,
        color: deshabilitado ? "var(--fg-4)" : "var(--fg-2)",
        cursor: deshabilitado ? "default" : "pointer",
      }}
    >
      {icono ?? <Plus size={15} />}
      {children}
    </button>
  );
}

/** Botón cuadrado de icono para el encabezado de una tarjeta. */
function BotonIcono({ label, onClick, color, children }: {
  label: string;
  /** Recibe el evento para poder anclar un globo a este botón. */
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 28, height: 28, flexShrink: 0, display: "flex",
        alignItems: "center", justifyContent: "center",
        background: "none", border: "none", borderRadius: "var(--r-sm)",
        cursor: "pointer", color: color ?? "var(--fg-3)",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Desplegable de opciones fijas, sin buscador.
 *
 * Mismo aspecto que `SearchSelect` —botón de 40px con su ChevronDown, panel con
 * sombra, palomita en la elegida— porque conviven en la misma tarjeta y un
 * `<select>` nativo al lado desentonaba: el nativo lo pinta el sistema
 * operativo, así que ni el alto ni la tipografía ni la lista coinciden.
 *
 * Sin buscador a propósito: estas listas tienen cuatro o cinco opciones fijas y
 * un campo de búsqueda encima de cinco opciones es un trasto.
 */
function Desplegable({ value, options, onChange }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const elegida = options.find(o => o.value === value);

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", height: 40, display: "flex", alignItems: "center", gap: 8,
          padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8,
          background: "var(--surface-1)", fontSize: 14,
          // Negro: estos desplegables siempre traen algo elegido (el operador y
          // el modo nacen con un valor por defecto), así que nunca están en el
          // estado "vacío" que en los demás pickers justifica el gris. Gris acá
          // haría parecer un marcador de posición algo que ya es una elección.
          color: "var(--fg-1)",
          cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {elegida?.label ?? "Elige una opción"}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: "var(--fg-4)" }} />
      </button>

      {open && (
        <>
          {/* Capa de cierre: un clic fuera cierra sin escuchar en window. */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 590 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 600,
            background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
            boxShadow: "var(--shadow-md)", overflow: "hidden",
          }}>
            {options.map(o => {
              const on = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 12px", border: "none", textAlign: "left",
                    background: on ? "var(--brand-tint)" : "transparent",
                    fontSize: 14, color: "var(--fg-1)", cursor: "pointer", fontFamily: "inherit",
                  }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { if (!on) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>{o.label}</span>
                  {on && <Check size={14} style={{ flexShrink: 0, color: "var(--brand)" }} />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * El ajuste de frecuencia de una acción, en un globo anclado a su botón.
 *
 * Sale por un portal y con coordenadas de viewport, no como hijo del botón: el
 * cuerpo del panel tiene scroll propio, así que un `position: absolute` dentro
 * quedaba recortado por ese contenedor y el globo se veía cortado por abajo.
 *
 * Si no cabe debajo del botón se dibuja encima. Es la misma idea que un menú
 * nativo: el globo se acomoda al hueco que hay, en vez de desbordar.
 */
function PopoverFrecuencia({ valor, onChange, onClose, ancla }: {
  valor: string;
  onChange: (v: string) => void;
  onClose: () => void;
  ancla: DOMRect;
}) {
  const ANCHO = 280;
  const ALTO_ESTIMADO = 190;

  const cabeAbajo = ancla.bottom + 6 + ALTO_ESTIMADO <= window.innerHeight;
  const top = cabeAbajo ? ancla.bottom + 6 : Math.max(8, ancla.top - 6 - ALTO_ESTIMADO);
  // Alineado a la derecha del botón, sin salirse por ningún borde.
  const left = Math.min(
    Math.max(8, ancla.right - ANCHO),
    Math.max(8, window.innerWidth - ANCHO - 8),
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Capa de cierre: un clic fuera cierra el globo sin escuchar en window. */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 480 }} />
      <div style={{
        position: "fixed", top, left, zIndex: 481,
        width: ANCHO, padding: 14, textAlign: "left",
        background: "var(--surface-1)", border: "1px solid var(--border)",
        borderRadius: "var(--r-md)", boxShadow: "var(--shadow-lg)",
      }}>
        <label style={{ ...labelStyle, marginBottom: 8 }}>
          Como máximo, crear una orden cada
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="number" min={0} value={valor}
            onChange={e => onChange(e.target.value)}
            style={{ ...inputStyle, width: 90 }}
          />
          <span style={{ fontSize: 14, color: "var(--fg-2)" }}>minutos</span>
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--fg-4)", lineHeight: 1.5 }}>
          Si el medidor sigue marcando por encima del valor, no se abre una
          orden nueva hasta que pase este tiempo.
        </p>
      </div>
    </>,
    document.body,
  );
}

/** Un archivo de la regla: ya subido (`link`) o recién elegido (`file`). */
interface ArchivoItem {
  /** Índice en su lista de origen, para renombrar y quitar sin ambigüedad. */
  idx: number;
  nombre: string;
  /** KB. Solo los recién elegidos lo saben: de un link subido no se conoce. */
  size?: number;
  subido: boolean;
  esImagen: boolean;
}

/**
 * Lista de archivos con el diseño de "Adjuntos" de OTCrearPanel: encabezado con
 * icono de marca, vacío de borde punteado con un botón sólido, y la lista
 * sangrada 22px para alinear con el texto del encabezado.
 *
 * Sirve a Imágenes y a Adjuntos porque son la misma lista con otro `accept`;
 * duplicar 90 líneas para cambiar un filtro de archivos no se paga solo.
 */
/**
 * Selector de tipo: la lista de opciones de un paso.
 *
 * Es el vacío del paso Y el "agregar otro" una vez que hay tarjetas. Las dos
 * cosas son la misma lista, así que es un componente y no dos bloques: cuando
 * el paso está vacío se dibuja abierta, y con tarjetas se esconde detrás del
 * botón punteado para no repetir cuatro filas debajo de cada una.
 */
function SelectorTipo<T extends string>({
  opciones, textoBoton, etiquetaAria, onElegir, icono,
}: {
  opciones: { value: T; label: string; disponible?: boolean; yaEsta?: boolean }[];
  /** Ausente = el paso está vacío y la lista se muestra desplegada. */
  textoBoton?: string;
  /** Prefijo del nombre accesible de cada fila, para poder distinguirlas. */
  etiquetaAria: string;
  onElegir: (v: T) => void;
  icono?: (v: T) => React.ReactNode;
}) {
  /**
   * Dónde dibujar la lista desplegada, en coordenadas de viewport.
   *
   * `null` = cerrada. Se guarda el rect del botón al abrir porque la lista sale
   * por un portal: el cuerpo del panel tiene scroll propio, así que un
   * `position: absolute` dentro quedaba recortado por ese contenedor y las
   * últimas filas no se podían ni ver ni alcanzar con scroll. Es el mismo
   * arreglo que ya tenía PopoverFrecuencia.
   */
  const [ancla, setAncla] = useState<DOMRect | null>(null);
  const lista = (
    <div style={{
      border: "1px solid var(--border)", borderRadius: "var(--r-md)",
      background: "var(--surface-1)", overflow: "hidden",
    }}>
      {opciones.map((o, i) => {
        const bloqueada = o.disponible === false || o.yaEsta;
        return (
          <button
            key={o.value}
            type="button"
            disabled={bloqueada}
            aria-label={`${etiquetaAria}: ${o.label}`}
            title={o.yaEsta ? "Ya agregada" : (o.disponible === false ? "Aún no disponible" : undefined)}
            onClick={() => { onElegir(o.value); setAncla(null); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "14px 12px", border: "none", textAlign: "left",
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
              background: "transparent", fontSize: 14, fontFamily: "inherit",
              color: "var(--brand)",
              cursor: bloqueada ? "default" : "pointer",
            }}
            onMouseEnter={e => { if (!bloqueada) e.currentTarget.style.background = "var(--surface-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            {/* El icono va en color de marca y el rótulo en negro: azul sobre
                azul hacía que la fila entera se leyera como un enlace, cuando
                lo que es, es una opción de una lista. Sin icono —condiciones—
                la fila es solo el texto. */}
            {bloqueada
              ? <Lock size={15} style={{ color: "var(--fg-4)" }} />
              : icono?.(o.value)}
            <span style={{ flex: 1, color: bloqueada ? "var(--fg-4)" : "var(--fg-1)" }}>
              {o.label}
            </span>
            <ChevronRight size={15} style={{ color: "var(--fg-4)" }} />
          </button>
        );
      })}
    </div>
  );

  if (!textoBoton) return lista;

  // Alto estimado de la lista, para decidir si cabe debajo del botón. Es una
  // cuenta y no una medición porque hay que resolverlo ANTES de dibujarla.
  const alto = opciones.length * 48 + 2;
  const cabeDebajo = ancla
    ? ancla.bottom + 4 + alto <= window.innerHeight - 8
    : true;

  return (
    <>
      <BotonAgregar
        onClick={e => setAncla(prev => (prev ? null : e.currentTarget.getBoundingClientRect()))}
      >
        {textoBoton}
      </BotonAgregar>

      {ancla && typeof document !== "undefined" && createPortal(
        <>
          {/* Capa de cierre: un clic fuera cierra sin escuchar en window. */}
          <div onClick={() => setAncla(null)} style={{ position: "fixed", inset: 0, zIndex: 480 }} />
          <div style={{
            position: "fixed", zIndex: 481,
            // Si no cabe debajo se dibuja encima, como un menú nativo: se
            // acomoda al hueco que hay en vez de desbordar la ventana.
            top: cabeDebajo ? ancla.bottom + 4 : Math.max(8, ancla.top - 4 - alto),
            left: ancla.left, width: ancla.width,
            boxShadow: "var(--shadow-lg)", borderRadius: "var(--r-md)",
          }}>
            {lista}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

/**
 * Los campos de "Cambiar el estado del activo".
 *
 * Los mismos que CambiarEstadoDialog y en el mismo orden, porque escriben en la
 * misma tabla: quien registró una parada a mano reconoce el formulario. Lo que
 * no está es la fecha de inicio —acá el instante es el de la lectura— ni la
 * jerarquía, que nadie puede confirmar en un disparo automático.
 */
function CamposCambiarEstado({ a, activos, onCambiar }: {
  a: AccionForm;
  activos: { id: string; label: string; sub?: string }[];
  onCambiar: (patch: Partial<AccionForm>) => void;
}) {
  const [motivos, setMotivos] = useState<MotivoInactividad[]>([]);
  const [wsMotivos, setWsMotivos] = useState<string | null>(null);

  // El catálogo se pide una vez por tarjeta abierta. Es una lista chica y solo
  // hace falta cuando la parada es imprevista, pero pedirla al desplegar evita
  // el salto de un desplegable que aparece vacío y se llena solo.
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        const [lista, perfil] = await Promise.all([
          fetchMotivosInactividad(),
          user
            ? sb.from("usuarios").select("workspace_id").eq("id", user.id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (cancelado) return;
        setMotivos(lista);
        setWsMotivos((perfil.data?.workspace_id as string | undefined) ?? null);
      } catch {
        if (!cancelado) setMotivos([]);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <label style={labelStyle}>Activo</label>
        <SearchSelect
          placeholder="El activo que disparó la automatización"
          emptyLabel="El activo que disparó la automatización"
          value={a.activo_id}
          options={activos.map(x => ({ id: x.id, label: x.label, sub: x.sub }))}
          onChange={v => onCambiar({ activo_id: v })}
        />
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5 }}>
          Sin elegir uno, cambia el del medidor que disparó la regla.
        </p>
      </div>

      <div>
        <label style={labelStyle}>Cambiar el estado a</label>
        <Desplegable
          value={a.estado}
          options={ESTADOS_DESTINO.map(e => ({ value: e.value, label: e.label }))}
          onChange={v => onCambiar({
            estado: v as AssetStatus,
            // Operativo no lleva tipo ni motivo: dejarlos cargados mandaría
            // valores que la base rechaza.
            ...(v === "operativo" ? { tipo_inactividad: "" as const, motivo_id: "" } : {}),
          })}
        />
      </div>

      {a.estado !== "operativo" && (
        <div>
          <label style={labelStyle}>Tipo de parada</label>
          <Desplegable
            value={a.tipo_inactividad}
            options={[
              { value: "", label: "Elige el tipo de parada" },
              { value: "planeado", label: "Planeado — mantención o inspección prevista" },
              { value: "sin_planear", label: "Sin planear — avería o falla inesperada" },
            ]}
            onChange={v => onCambiar({
              tipo_inactividad: v as TipoInactividad | "",
              ...(v === "sin_planear" ? {} : { motivo_id: "" }),
            })}
          />
        </div>
      )}

      {/* Motivo: solo para la avería, igual que en el diálogo. Una parada
          imprevista sin causa registrada es el dato que después no se puede
          reconstruir, y deja una barra "sin clasificar" que se come el Pareto. */}
      {a.estado !== "operativo" && a.tipo_inactividad === "sin_planear" && (
        <div>
          <label style={labelStyle}>Motivo de la falla</label>
          <SearchSelect
            placeholder="Buscar o crear motivo…"
            emptyLabel="Sin motivo"
            value={a.motivo_id}
            options={motivos.map(m => ({ id: m.id, label: m.nombre }))}
            onChange={v => onCambiar({ motivo_id: v })}
            createLabel="Crear motivo"
            onCreate={wsMotivos ? (async nombre => {
              const nuevo = await createMotivoInactividad(wsMotivos, nombre);
              setMotivos(prev => [...prev, nuevo].sort((x, y) => x.nombre.localeCompare(y.nombre)));
              return nuevo.id;
            }) : undefined}
          />
        </div>
      )}

      <div>
        <label style={labelStyle}>Notas (opcional)</label>
        <input
          type="text"
          value={a.notas}
          onChange={e => onCambiar({ notas: e.target.value })}
          placeholder="Ej. Falla en el motor principal"
          style={inputStyle}
        />
      </div>
    </div>
  );
}

/** Una condición del paso "Sólo si además…", con su tarjeta y sus campos. */
function TarjetaCondicion({ c, onCambiar, onQuitar }: {
  c: RequisitoForm;
  onCambiar: (patch: Partial<RequisitoForm>) => void;
  onQuitar: () => void;
}) {
  const meta = TIPOS_CONDICION.find(t => t.value === c.tipo);

  // Interruptor de una lista de valores: elegir es alternar. Se usa igual para
  // estados, criticidades y días, que son las tres listas de esta tarjeta.
  const alternar = <T,>(lista: T[], v: T): T[] =>
    lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v];

  return (
    <Tarjeta
      titulo={meta?.label ?? c.tipo}
      acciones={
        <BotonIcono label="Quitar la condición" onClick={onQuitar} color="var(--danger)">
          <Trash2 size={15} />
        </BotonIcono>
      }
    >
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, fontSize: 14, color: "var(--fg-3)", lineHeight: 1.5 }}>
          {meta?.ayuda}
        </p>

        {c.tipo === "estado_activo" && (
          <ChipsSeleccion
            opciones={ESTADOS_ACTIVO.map(e => ({ value: e.value, label: e.label }))}
            elegidas={c.estados}
            onAlternar={v => onCambiar({ estados: alternar(c.estados, v as EstadoActivo) })}
          />
        )}

        {c.tipo === "criticidad_activo" && (
          <ChipsSeleccion
            opciones={CRITICIDADES.map(e => ({ value: e.value, label: e.label }))}
            elegidas={c.criticidades}
            onAlternar={v => onCambiar({ criticidades: alternar(c.criticidades, v as AssetCriticality) })}
          />
        )}

        {c.tipo === "ventana_horaria" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* `type="time"` nativo: el navegador ya trae el reloj, el formato
                  de 24h según el idioma y el teclado correcto en móvil. Un
                  selector propio serían 200 líneas para empatar. */}
              <span style={{ fontSize: 14, color: "var(--fg-2)" }}>Entre las</span>
              <input
                type="time"
                value={c.desde}
                onChange={e => onCambiar({ desde: e.target.value })}
                style={{ ...inputStyle, width: 120 }}
              />
              <span style={{ fontSize: 14, color: "var(--fg-2)" }}>y las</span>
              <input
                type="time"
                value={c.hasta}
                onChange={e => onCambiar({ hasta: e.target.value })}
                style={{ ...inputStyle, width: 120 }}
              />
            </div>

            {/* Se dice explícitamente porque es la duda que genera: una ventana
                22:00–06:00 es el turno de noche, no un error del usuario. */}
            {c.desde > c.hasta && c.hasta !== "" && (
              <p style={{ margin: 0, fontSize: 14, color: "var(--fg-3)" }}>
                La ventana cruza la medianoche: va de las {c.desde} de un día a las {c.hasta} del siguiente.
              </p>
            )}

            <div>
              <span style={{ ...labelStyle, marginBottom: 8 }}>Días</span>
              <ChipsSeleccion
                opciones={DIAS_SEMANA.map(d => ({ value: String(d.value), label: d.label }))}
                elegidas={c.dias.map(String)}
                onAlternar={v => onCambiar({ dias: alternar(c.dias, Number(v)) })}
              />
              <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--fg-4)" }}>
                Sin ninguno elegido, la regla vale todos los días.
              </p>
            </div>
          </>
        )}

        {/* `sin_ot_abierta_en_activo` no tiene campos: la condición ES la frase.
            Solo le queda el interruptor de invertir, que tampoco lleva —invertirla
            sería "actúa solo si ya hay una OT abierta", que no le sirve a nadie. */}

        {meta?.negable && (
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={c.negado}
              onChange={e => onCambiar({ negado: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: "var(--brand)", cursor: "pointer" }}
            />
            <span style={{ fontSize: 14, color: "var(--fg-2)" }}>{meta.negable}</span>
          </label>
        )}
      </div>
    </Tarjeta>
  );
}

/**
 * Lista de valores que se eligen tocando, en vez de un desplegable múltiple.
 *
 * Son listas de tres a siete opciones cortas y se eligen varias: un desplegable
 * obligaría a abrirlo para saber qué hay elegido, y acá se ve de un vistazo.
 */
function ChipsSeleccion({ opciones, elegidas, onAlternar }: {
  opciones: { value: string; label: string }[];
  elegidas: string[];
  onAlternar: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {opciones.map(o => {
        const on = elegidas.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onAlternar(o.value)}
            style={{
              height: 34, padding: "0 14px", borderRadius: 999,
              border: "1px solid " + (on ? "var(--brand)" : "var(--border)"),
              background: on ? "var(--brand-tint)" : "var(--surface-1)",
              color: on ? "var(--brand)" : "var(--fg-2)",
              fontSize: 14, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SeccionArchivos({
  icono, titulo, textoVacio, textoBoton, accept,
  items, onAgregar, onRenombrar, onQuitar,
}: {
  icono: React.ReactNode;
  titulo: string;
  textoVacio: string;
  textoBoton: string;
  accept: string;
  items: ArchivoItem[];
  onAgregar: (files: File[]) => void;
  onRenombrar: (it: ArchivoItem, nombre: string) => void;
  onQuitar: (it: ArchivoItem) => void;
}) {
  // El input vive dentro y no en el padre: con una sección por acción, un ref
  // compartido mandaba todos los archivos a la primera tarjeta.
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div style={{ padding: "14px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 16, display: "flex", justifyContent: "flex-start", flexShrink: 0, color: "var(--brand)" }}>
            {icono}
          </span>
          <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em" }}>
            {titulo}
          </span>
        </div>
        {/* Igual que en OTCrearPanel: el botón del encabezado solo aparece con la
            lista llena, porque con la lista vacía el del propio vacío ya cumple
            esa función y tener los dos duplica la misma acción. */}
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              height: 32, padding: "0 12px",
              border: "1px solid var(--border)", borderRadius: 8,
              background: "var(--surface-1)", color: "var(--brand)",
              fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Plus size={11} />
            {textoBoton}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          style={{ display: "none" }}
          onChange={e => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) onAgregar(files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length === 0 ? (
        <div style={{ marginLeft: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "18px 12px", border: "1px dashed var(--border-strong)", borderRadius: "var(--r-md)", background: "var(--surface-canvas)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14, color: "var(--fg-3)" }}>
            {textoVacio}
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{ height: 38, padding: "0 18px", display: "flex", alignItems: "center", gap: 7, border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)", color: "var(--brand)", fontSize: 14, fontWeight: 400, fontFamily: "inherit", cursor: "pointer" }}
          >
            <Plus size={15} /> {textoBoton}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 22 }}>
          {items.map(it => (
            <div key={`${it.subido ? "s" : "n"}-${it.idx}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-0)" }}>
              {it.esImagen
                ? <ImageIcon size={14} style={{ color: "var(--brand)", flexShrink: 0 }} />
                : it.subido
                  ? <FileText size={14} style={{ color: "var(--brand)", flexShrink: 0 }} />
                  : <File size={14} style={{ color: "var(--fg-4)", flexShrink: 0 }} />}
              <input
                type="text"
                value={it.nombre}
                onChange={e => onRenombrar(it, e.target.value)}
                style={{
                  flex: 1, fontSize: 14, color: "var(--fg-1)", border: "none",
                  outline: "none", background: "transparent", fontFamily: "inherit", minWidth: 0,
                }}
              />
              <span style={{ fontSize: 14, color: "var(--fg-4)", flexShrink: 0 }}>
                {it.subido ? "Subido" : `${it.size} KB`}
              </span>
              <button
                type="button"
                onClick={() => onQuitar(it)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex", padding: 2, flexShrink: 0 }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--danger)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--fg-4)"; }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "10px 0", background: "none", border: "none",
              color: "var(--brand)", fontSize: 14, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Plus size={13} /> {textoBoton}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Una condición sobre el medidor del disparador.
 *
 * Los números viven como texto: un input vacío no es 0, y `Number("")` sí lo es.
 */
interface CondicionForm {
  /** Id de la fila en la base, al editar. Vacío = condición nueva. Se arrastra
   *  para que guardar actualice la fila en vez de recrearla: `armado` (el latch
   *  de "sólo la primera vez") vive ahí y no en el formulario. */
  id?: string;
  operador: OperadorTrigger;
  valor: string;
  valor_hasta: string;
  /**
   * "Próximo disparo" de los operadores acumulados, como texto.
   *
   * Vacío = que lo fije la primera lectura. Al editar se carga el valor que el
   * motor viene avanzando, y solo viaja de vuelta si el usuario lo cambió:
   * reenviarlo tal cual retrocedría el contador al valor que tenía cuando se
   * abrió el panel.
   */
  proximo_disparo: string;
  /** El que vino de la base, para saber si el de arriba cambió. */
  proximo_disparo_inicial?: string;
}

/**
 * Un disparador: UN medidor y las condiciones que se le piden a su lectura.
 *
 * En la base cada condición es una fila de `automatizacion_triggers` con su
 * propio `medidor_id` repetido; acá se agrupan por medidor porque es como se
 * piensan ("la corriente del motor: que pase de 10 O que baje de 2") y porque
 * repetir el selector de medidor en cada condición era el mismo dato tres veces.
 *
 * Las condiciones se unen con O, que es lo que el motor ya hace: recorre los
 * disparadores del medidor por separado y le basta con que uno se cumpla.
 */
interface TriggerForm {
  /**
   * Filtro, NO dato guardado: el disparador se identifica por `medidor_id` y
   * nada más.
   *
   * Existe porque elegir el medidor a secas no escala —un taller con 200
   * medidores es una lista de 200— y porque el usuario piensa en el activo
   * primero: "la bomba 3", después "su horómetro". Al elegir un activo, la
   * lista de medidores se reduce a los suyos.
   *
   * Al editar se deduce del medidor guardado, así que el campo aparece relleno
   * sin haberlo persistido nunca.
   */
  activo_id: string;
  medidor_id: string;
  condiciones: CondicionForm[];
  /**
   * El "Para": cuándo cuenta como cumplida la condición —una lectura, la
   * primera hasta normalizarse, o varias seguidas.
   *
   * Vive en el disparador y no en cada condición, aunque en la base sea una
   * columna por fila: es una sola pregunta sobre el medidor, y repetirla por
   * condición dejaba tres desplegables que podían contradecirse sin que hubiera
   * forma de saber cuál manda. Al guardar se escribe el mismo valor en todas
   * las filas del disparador. MaintainX tampoco lo repite.
   */
  modo: ModoTrigger;
  modo_n: string;
}

const CONDICION_VACIA: CondicionForm = {
  operador: "mayor_igual", valor: "", valor_hasta: "", proximo_disparo: "",
};

const TRIGGER_VACIO: TriggerForm = {
  activo_id: "", medidor_id: "", condiciones: [CONDICION_VACIA],
  modo: "una_lectura", modo_n: "2",
};

/**
 * Una acción del formulario: la OT que se va a crear, más sus dos frenos.
 *
 * Es un objeto y no dieciséis `useState` sueltos porque ahora hay N: una regla
 * puede abrir la orden del eléctrico y la del mecánico con la misma lectura.
 * El motor ya las recorría todas (`ORDER BY orden, id`) y frena cada una por
 * separado (`accion_id`), así que esto era lo único que faltaba.
 */
interface AccionForm {
  /** Id de la fila en la base, al editar. Vacío = acción nueva. Se arrastra
   *  para no recrear la fila: el freno de retrigger busca por `accion_id`, y
   *  una acción recreada estrena historial y se olvida del enfriamiento. */
  id?: string;
  titulo: string;
  descripcion: string;
  ubicacion_id: string;
  activo_id: string;
  asignados: string[];
  categoria_ids: string[];
  horas: string;
  minutos: string;
  prioridad: string;
  tipo_trabajo: string;
  procedimientos: ProcedimientoSeleccionado[];
  /** Archivos ya subidos, tal como quedan en el config. */
  links: OTLink[];
  /** Elegidos en esta sesión y todavía sin subir. Se suben al guardar. */
  nuevosArchivos: { file: File; nombre: string }[];
  solo_si_anterior_cerrada: boolean;
  retrigger: string;
  /** Plegada muestra "Escribir la orden de trabajo" en vez de los campos. */
  abierta: boolean;

  /**
   * Qué hace esta acción. Decide qué campos usa la tarjeta.
   *
   * Los campos de los dos tipos conviven en la misma interfaz plana, igual que
   * en RequisitoForm: al guardar, `configDeAccion` recorta a los que ese tipo
   * escribe. Separarlos en dos interfaces obligaría a discriminar en cada
   * `setAccion` para nada.
   */
  tipo: TipoAccion;
  /** cambiar_estado_activo. Vacío = el activo que disparó. */
  estado: AssetStatus;
  tipo_inactividad: TipoInactividad | "";
  motivo_id: string;
  notas: string;
}

/**
 * Qué dice el encabezado de una acción plegada.
 *
 * Existe para que plegar no vuelva las tarjetas indistinguibles: con tres
 * "Crear una orden de trabajo" idénticas, borrar la equivocada es cuestión de
 * tiempo. Se nombra por el título de la OT —que es como el usuario la piensa—
 * y se cuenta lo que lleva adentro, para que se note cuál tiene trabajo hecho.
 */
function resumirAccion(a: AccionForm): string {
  if (!a.titulo.trim()) return "Sin definir — falta el título";

  const partes: string[] = [];
  if (a.asignados.length > 0) {
    partes.push(a.asignados.length === 1 ? "1 asignado" : `${a.asignados.length} asignados`);
  }
  if (a.procedimientos.length > 0) {
    partes.push(a.procedimientos.length === 1 ? "1 procedimiento" : `${a.procedimientos.length} procedimientos`);
  }
  const archivos = a.links.length + a.nuevosArchivos.length;
  if (archivos > 0) partes.push(archivos === 1 ? "1 archivo" : `${archivos} archivos`);

  return partes.length > 0 ? partes.join(" · ") : "Sin asignados ni adjuntos";
}

/**
 * Una condición en el formulario.
 *
 * Plana y con TODOS los campos de los cuatro tipos, en vez de una unión
 * discriminada: cambiar el tipo de una tarjeta conserva lo que el usuario ya
 * había puesto en los otros campos, y al guardar se recorta a lo que ese tipo
 * usa. Una unión obligaría a reconstruir el objeto en cada cambio de tipo y
 * perdería esos valores.
 */
interface RequisitoForm {
  tipo: TipoCondicion;
  estados: EstadoActivo[];
  criticidades: AssetCriticality[];
  desde: string;
  hasta: string;
  dias: number[];
  negado: boolean;
}

function condicionVacia(tipo: TipoCondicion): RequisitoForm {
  return {
    tipo,
    // Los defaults son el caso que la gente viene a escribir: "no abras otra OT
    // si ya está en mantención" y "el turno de noche". Arrancar todo vacío
    // obliga a configurar de cero una condición que casi siempre es la misma.
    estados: tipo === "estado_activo" ? ["mantencion", "fuera_servicio"] : [],
    criticidades: tipo === "criticidad_activo" ? ["critico"] : [],
    desde: "22:00",
    hasta: "06:00",
    dias: [],
    negado: tipo === "estado_activo",
  };
}

/** Del formulario al `config` jsonb: solo las claves que ese tipo usa. */
function configDeCondicion(c: RequisitoForm): CondicionConfig {
  switch (c.tipo) {
    case "estado_activo":     return { estados: c.estados };
    case "criticidad_activo": return { criticidades: c.criticidades };
    case "ventana_horaria":   return { desde: c.desde, hasta: c.hasta, dias: c.dias };
    case "sin_ot_abierta_en_activo": return {};
  }
}

/** Plegada, la tarjeta de cambio de estado dice qué activo y a qué estado. */
function resumirCambioEstado(
  a: AccionForm,
  activos: { id: string; label: string }[],
): string {
  const destino = ESTADOS_DESTINO.find(e => e.value === a.estado)?.label ?? a.estado;
  const quien = a.activo_id
    ? (activos.find(x => x.id === a.activo_id)?.label ?? "Activo eliminado")
    : "El activo que disparó";
  if (a.estado !== "operativo" && !a.tipo_inactividad) {
    return `${quien} → ${destino} — falta el tipo de parada`;
  }
  return `${quien} → ${destino}`;
}

function accionVacia(abierta: boolean, tipo: TipoAccion = "crear_ot"): AccionForm {
  return {
    titulo: "", descripcion: "", ubicacion_id: "", activo_id: "",
    asignados: [], categoria_ids: [], horas: "", minutos: "",
    prioridad: "ninguna", tipo_trabajo: "reactiva",
    procedimientos: [], links: [], nuevosArchivos: [],
    solo_si_anterior_cerrada: false, retrigger: "5", abierta,
    tipo,
    // `fuera_servicio` y no `operativo`: una regla que reacciona a un medidor
    // fuera de rango casi siempre está registrando una parada, no el fin de
    // una. `operativo` no lleva tipo de inactividad, así que arrancar ahí
    // escondería el campo que en el caso común hay que llenar.
    estado: "fuera_servicio",
    tipo_inactividad: "",
    motivo_id: "",
    notas: "",
  };
}

/** Del formulario al `config` jsonb: solo las claves que ese tipo escribe. */
function configDeAccion(a: AccionForm, links: OTLink[]): ConfigCrearOT | ConfigCambiarEstado {
  if (a.tipo === "cambiar_estado_activo") {
    return {
      activo_id: a.activo_id || null,
      estado: a.estado,
      // La base rechaza un tipo de inactividad en `operativo` y lo exige en el
      // resto; el mismo criterio que la RPC del diálogo manual.
      tipo_inactividad: a.estado === "operativo" ? null : (a.tipo_inactividad || null),
      motivo_id: a.tipo_inactividad === "sin_planear" && a.estado !== "operativo"
        ? (a.motivo_id || null) : null,
      notas: a.notas.trim() || undefined,
    };
  }
  const minutos = (Number(a.horas) || 0) * 60 + (Number(a.minutos) || 0);
  return {
    titulo: a.titulo.trim(),
    descripcion: a.descripcion.trim() || undefined,
    ubicacion_id: a.ubicacion_id || null,
    activo_id: a.activo_id || null,
    asignados_ids: a.asignados,
    categoria_ids: a.categoria_ids,
    // 0 se guarda como null: "sin estimación" y "estimado en cero" no son lo
    // mismo.
    tiempo_estimado: minutos > 0 ? minutos : null,
    prioridad: a.prioridad,
    tipo_trabajo: a.tipo_trabajo,
    // Solo ids: el nombre se relee del catálogo al abrir el panel.
    procedimiento_ids: a.procedimientos.map(p => p.id),
    links,
  };
}

export interface AutomatizacionCrearPanelProps {
  wsId: string;
  /** `null` = alta. Con valor, el panel edita ese conjunto completo. */
  inicial: AutomatizacionCompleta | null;
  medidores: MedidorConUltima[];
  activos: { id: string; label: string; sub?: string }[];
  ubicaciones: { id: string; label: string }[];
  usuarios: Usuario[];
  categorias: CategoriaOT[];
  onClose: () => void;
  onGuardada: () => void;
}

export default function AutomatizacionCrearPanel({
  wsId, inicial, medidores, activos, ubicaciones, usuarios, categorias, onClose, onGuardada,
}: AutomatizacionCrearPanelProps) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");

  // Las filas de la base se agrupan por medidor: N filas con el mismo
  // `medidor_id` son N condiciones de un mismo disparador.
  const [triggers, setTriggers] = useState<TriggerForm[]>(() => {
    if (!inicial || inicial.triggers.length === 0) return [TRIGGER_VACIO];
    return agruparTriggersPorMedidor(inicial.triggers).map(g => ({
      // Se deduce del medidor: el filtro no se guarda, pero al reabrir la regla
      // el campo tiene que mostrar el activo que el usuario eligió.
      activo_id: medidores.find(m => m.id === g.medidor_id)?.activo_id ?? "",
      medidor_id: g.medidor_id,
      condiciones: g.condiciones.map(t => ({
        id: t.id,
        operador: t.operador,
        valor: String(t.valor),
        valor_hasta: t.valor_hasta != null ? String(t.valor_hasta) : "",
        // El objetivo que el motor viene avanzando. Se guarda también sin tocar
        // para poder distinguir "el usuario lo cambió" de "lo dejó como estaba".
        proximo_disparo: t.proximo_disparo != null ? String(t.proximo_disparo) : "",
        proximo_disparo_inicial: t.proximo_disparo != null ? String(t.proximo_disparo) : "",
      })),
      // Todas las filas del grupo comparten modo —así las guarda este panel—,
      // así que la primera lo representa. Si una regla vieja tuviera modos
      // distintos por fila, manda el de la primera y al guardar se unifican.
      modo: g.condiciones[0].modo,
      modo_n: String(g.condiciones[0].modo_n ?? 2),
    }));
  });

  /**
   * Las condiciones guardadas, aplanadas al formulario.
   *
   * Sin `id`: no guardan estado del motor, así que al guardar se reemplazan
   * enteras (ver reemplazarCondiciones en la api).
   */
  const [condiciones, setCondiciones] = useState<RequisitoForm[]>(() =>
    (inicial?.condiciones ?? []).map(c => ({
      ...condicionVacia(c.tipo),
      estados: c.config.estados ?? [],
      criticidades: c.config.criticidades ?? [],
      desde: c.config.desde ?? "22:00",
      hasta: c.config.hasta ?? "06:00",
      dias: c.config.dias ?? [],
      negado: c.negado,
    })),
  );

  /**
   * Al crear no hay ninguna: el paso muestra el selector de tipo y la primera
   * tarjeta nace del clic, ya desplegada —se acaba de pedir, hay que llenarla—.
   * Al editar vienen todas abiertas: esconderle al usuario lo que vino a
   * cambiar sería un clic de peaje.
   */
  const [acciones, setAcciones] = useState<AccionForm[]>(() => {
    // Vacío, no una OT por defecto: crear la orden dejó de ser LA acción en
    // cuanto hubo dos, así que el paso arranca con el selector de tipo y la
    // tarjeta aparece recién cuando el usuario elige una.
    if (!inicial) return [];
    return inicial.acciones.map(a => {
      const c = a.config ?? {};
      return {
        id: a.id,
        tipo: a.tipo,
        estado: (c.estado ?? "fuera_servicio") as AssetStatus,
        tipo_inactividad: (c.tipo_inactividad ?? "") as TipoInactividad | "",
        motivo_id: c.motivo_id ?? "",
        notas: c.notas ?? "",
        titulo: c.titulo ?? "",
        descripcion: c.descripcion ?? "",
        ubicacion_id: c.ubicacion_id ?? "",
        activo_id: c.activo_id ?? "",
        asignados: c.asignados_ids ?? [],
        categoria_ids: c.categoria_ids ?? [],
        horas: c.tiempo_estimado ? String(Math.floor(c.tiempo_estimado / 60)) : "",
        minutos: c.tiempo_estimado ? String(c.tiempo_estimado % 60) : "",
        prioridad: c.prioridad ?? "ninguna",
        // 'reactiva' es el mismo valor al que cae el motor cuando la clave
        // falta, así que las reglas viejas siguen viendo lo que ya hacían.
        tipo_trabajo: c.tipo_trabajo ?? "reactiva",
        procedimientos: (c.procedimiento_ids ?? []).map(id => ({ id, nombre: "Cargando…" })),
        links: c.links ?? [],
        nuevosArchivos: [],
        solo_si_anterior_cerrada: a.solo_si_anterior_cerrada ?? false,
        retrigger: String(a.retrigger_minutos ?? 5),
        abierta: true,
      };
    });
  });

  /**
   * Popover de frecuencia: qué acción y dónde está su botón.
   *
   * El rect se guarda al abrir porque el globo se dibuja por un portal, fuera
   * del árbol del botón, así que necesita coordenadas propias.
   */
  const [ajustes, setAjustes] = useState<{ i: number; rect: DOMRect } | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState<number | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /**
   * Los medidores del activo elegido, o todos si no hay activo.
   *
   * Sin activo se muestran todos a propósito: el filtro es una ayuda para
   * encontrar, no un paso obligatorio. Quien sabe el nombre del medidor lo
   * escribe y listo.
   */
  const opcionesMedidorDe = useCallback((activoId: string) =>
    medidores
      .filter(m => !activoId || m.activo_id === activoId)
      .map(m => ({
        id: m.id,
        label: `${m.nombre}${m.activo_nombre ? ` · ${m.activo_nombre}` : ""}`,
        sub: m.unidad || undefined,
      })), [medidores]);

  /** Activos que tienen al menos un medidor: el resto no puede disparar nada. */
  const opcionesActivo = useMemo(() => {
    const conMedidor = new Set(medidores.map(m => m.activo_id).filter(Boolean));
    return activos.filter(a => conMedidor.has(a.id));
  }, [medidores, activos]);

  /**
   * Rellena el nombre de los procedimientos guardados.
   *
   * El config solo trae ids, así que al abrir el panel la lista diría
   * "Cargando…". Se leen los nombres del catálogo: si un procedimiento fue
   * borrado desde que se guardó la regla, no vuelve y se cae de la lista, que es
   * lo correcto —el trigger también lo descarta por el JOIN.
   *
   * Una sola consulta con los ids de TODAS las acciones: son pocas y pedir una
   * por acción sería un viaje por tarjeta.
   */
  useEffect(() => {
    const ids = [...new Set((inicial?.acciones ?? []).flatMap(a => a.config?.procedimiento_ids ?? []))];
    if (ids.length === 0) return;
    let vivo = true;
    void (async () => {
      const { data } = await createClient()
        .from("procedimientos")
        .select("id, nombre")
        .in("id", ids);
      if (!vivo) return;
      const porId = new Map((data ?? []).map(p => [p.id as string, p.nombre as string]));
      setAcciones(prev => prev.map(a => ({
        ...a,
        procedimientos: a.procedimientos.flatMap(p =>
          porId.has(p.id) ? [{ ...p, nombre: porId.get(p.id)! }] : [],
        ),
      })));
    })();
    return () => { vivo = false; };
    // Solo al montar: `inicial` es el valor con el que se abrió el panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setAccion(i: number, patch: Partial<AccionForm>) {
    setAcciones(prev => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  }

  const esImagen = (nombre: string) => /\.(png|jpe?g|webp|gif|avif|heic)$/i.test(nombre);

  /**
   * Las dos listas de una acción (ya subidos + recién elegidos) vistas como una.
   *
   * El tipo se decide por la extensión y no por qué input la agregó: al reabrir
   * la regla solo hay links, sin memoria de en qué sección se cargaron.
   */
  const archivosDe = (a: AccionForm, clase: "imagen" | "adjunto"): ArchivoItem[] => {
    const quiere = (n: string) => (clase === "imagen" ? esImagen(n) : !esImagen(n));
    return [
      ...a.links.flatMap((l, idx) => {
        const nombre = l.nombre ?? l.label ?? "archivo";
        return quiere(nombre) ? [{ idx, nombre, subido: true, esImagen: esImagen(nombre) }] : [];
      }),
      ...a.nuevosArchivos.flatMap((n, idx) =>
        quiere(n.nombre)
          ? [{ idx, nombre: n.nombre, size: Math.round(n.file.size / 1024), subido: false, esImagen: esImagen(n.nombre) }]
          : [],
      ),
    ];
  };

  function agregarArchivos(i: number, files: File[]) {
    // El `accept` del input ya filtra, pero arrastrar o "todos los archivos" lo
    // esquiva. Se acepta igual y se deja donde corresponda por extensión, en vez
    // de rechazar: el archivo no se pierde y la lista sigue siendo coherente.
    setAcciones(prev => prev.map((a, j) => j !== i ? a : {
      ...a, nuevosArchivos: [...a.nuevosArchivos, ...files.map(f => ({ file: f, nombre: f.name }))],
    }));
  }

  function renombrarArchivo(i: number, it: ArchivoItem, nombre: string) {
    setAcciones(prev => prev.map((a, j) => {
      if (j !== i) return a;
      return it.subido
        ? { ...a, links: a.links.map((l, k) => (k === it.idx ? { ...l, nombre } : l)) }
        : { ...a, nuevosArchivos: a.nuevosArchivos.map((n, k) => (k === it.idx ? { ...n, nombre } : n)) };
    }));
  }

  function quitarArchivo(i: number, it: ArchivoItem) {
    // Del link solo se suelta la referencia: el objeto en R2 no se borra porque
    // las OT ya generadas lo siguen apuntando. Borrarlo dejaría esas OT con un
    // adjunto roto para cubrir unos KB.
    setAcciones(prev => prev.map((a, j) => {
      if (j !== i) return a;
      return it.subido
        ? { ...a, links: a.links.filter((_, k) => k !== it.idx) }
        : { ...a, nuevosArchivos: a.nuevosArchivos.filter((_, k) => k !== it.idx) };
    }));
  }

  function setTrigger(i: number, patch: Partial<TriggerForm>) {
    setTriggers(prev => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }

  function setCondicion(i: number, k: number, patch: Partial<CondicionForm>) {
    setTriggers(prev => prev.map((t, j) => j !== i ? t : {
      ...t,
      condiciones: t.condiciones.map((c, l) => (l === k ? { ...c, ...patch } : c)),
    }));
  }

  function agregarCondicion(i: number) {
    setTriggers(prev => prev.map((t, j) => j !== i ? t : {
      ...t, condiciones: [...t.condiciones, CONDICION_VACIA],
    }));
  }

  function quitarCondicion(i: number, k: number) {
    setTriggers(prev => prev.map((t, j) => j !== i ? t : {
      ...t, condiciones: t.condiciones.filter((_, l) => l !== k),
    }));
  }

  /**
   * Al cambiar el activo: si el medidor elegido no es suyo, se suelta; y si el
   * activo tiene exactamente uno, se elige solo.
   *
   * Lo segundo es la "selección automática de medidor": el caso normal es un
   * activo con un medidor, y obligar a un segundo clic para elegir la única
   * opción posible es trabajo por gusto.
   */
  function setActivoDeTrigger(i: number, activoId: string) {
    setTriggers(prev => prev.map((t, j) => (j === i ? {
      ...t,
      activo_id: activoId,
      medidor_id: medidorTrasCambiarActivo(t.medidor_id, activoId, medidores),
    } : t)));
  }

  async function guardar() {
    setErr(null);
    if (!nombre.trim()) return setErr("Ponle un nombre a la regla para poder reconocerla después.");
    if (triggers.some(t => !t.medidor_id)) return setErr("Falta elegir el medidor que la regla tiene que vigilar.");
    if (triggers.some(t => t.condiciones.length === 0))
      return setErr("Cada medidor necesita al menos una condición.");
    if (triggers.some(t => t.condiciones.some(c => c.valor.trim() === "" || !Number.isFinite(Number(c.valor)))))
      return setErr("El valor a partir del cual actúa la regla tiene que ser un número.");
    // Mismo chequeo que la constraint `automatizacion_triggers_hasta_solo_en_entre`.
    // Los dos existen a propósito: la constraint es la garantía, esto es la
    // frase legible.
    if (triggers.some(t => t.condiciones.some(c =>
          c.operador === "entre" && !(Number(c.valor_hasta) > Number(c.valor)))))
      return setErr("En un rango, el segundo valor tiene que ser mayor que el primero.");
    // Un delta de 0 o negativo no es una regla: "cada 0" dispararía siempre. El
    // sentido lo da el operador elegido, no el signo del número.
    if (triggers.some(t => t.condiciones.some(c => esDelta(c.operador) && Number(c.valor) <= 0)))
      return setErr("La cantidad de aumento o disminución tiene que ser mayor que cero.");
    // El modo cuenta cuántas de las últimas N lecturas cumplen un umbral, y un
    // cambio no es una propiedad de una lectura suelta. El motor las descarta;
    // acá se dice antes de guardar una regla que nunca dispararía.
    if (triggers.some(t => t.modo === "lecturas_multiples" && t.condiciones.some(c => esDelta(c.operador))))
      return setErr("Las condiciones de aumento o disminución no se pueden combinar con “Recién cuando se repita varias veces”.");

    // Una condición sin valores elegidos no se puede cumplir nunca: la regla
    // quedaría guardada y muda, y el usuario lo descubriría revisando el
    // historial. Mejor decirlo acá.
    if (condiciones.some(c => c.tipo === "estado_activo" && c.estados.length === 0))
      return setErr("Elige al menos un estado del activo en el requisito extra.");
    if (condiciones.some(c => c.tipo === "criticidad_activo" && c.criticidades.length === 0))
      return setErr("Elige al menos una criticidad en el requisito extra.");
    if (condiciones.some(c => c.tipo === "ventana_horaria" && (!c.desde || !c.hasta)))
      return setErr("La ventana de días y horas necesita una hora de inicio y una de fin.");

    if (acciones.length === 0) return setErr("La regla necesita al menos una acción.");

    // Se abre la acción incompleta antes de quejarse: plegada, el campo que
    // falta no está en pantalla, y un error que apunta a algo invisible no se
    // puede arreglar. Con varias, se dice CUÁL: "falta el título" sobre cuatro
    // tarjetas no orienta a nadie.
    // La parada imprevista exige motivo, igual que la RPC del diálogo manual.
    // Sin esto la regla se guarda y el motor la omite en silencio: el usuario lo
    // descubriría revisando el historial.
    const sinTipoParada = acciones.findIndex(a =>
      a.tipo === "cambiar_estado_activo" && a.estado !== "operativo" && !a.tipo_inactividad);
    if (sinTipoParada >= 0) {
      setAcciones(prev => prev.map((a, j) => (j === sinTipoParada ? { ...a, abierta: true } : a)));
      return setErr("Elige el tipo de parada del cambio de estado.");
    }
    const sinMotivo = acciones.findIndex(a =>
      a.tipo === "cambiar_estado_activo" && a.tipo_inactividad === "sin_planear" && !a.motivo_id);
    if (sinMotivo >= 0) {
      setAcciones(prev => prev.map((a, j) => (j === sinMotivo ? { ...a, abierta: true } : a)));
      return setErr("Elige el motivo de la falla del cambio de estado.");
    }

    const sinTitulo = acciones.findIndex(a => a.tipo === "crear_ot" && !a.titulo.trim());
    if (sinTitulo >= 0) {
      setAcciones(prev => prev.map((a, j) => (j === sinTitulo ? { ...a, abierta: true } : a)));
      return setErr(acciones.filter(a => a.tipo === "crear_ot").length === 1
        ? "Escribe qué trabajo hay que hacer: es el título de la orden que se va a crear."
        : `A la acción ${sinTitulo + 1} le falta el título de la orden de trabajo.`);
    }

    setGuardando(true);
    try {
      // Los archivos se suben acá y no al elegirlos: si el usuario cancela el
      // panel, no queda nada en R2. Se sube UNA vez por regla —no por OT— y
      // cada OT generada hereda la misma URL.
      //
      // La carpeta es "adjuntos" y no "automatizaciones/<ws>": r2-presign
      // autoriza un set fijo de raíces y esa no está en él, así que devolvía
      // 403 forbidden_folder. `adjuntos` ya es una raíz libre para usuarios
      // autenticados, justamente para subir antes de que exista la fila, que es
      // este caso.
      //
      // No se ensancha la lista de raíces: es un control de permisos, y sumarle
      // una carpeta para ahorrarse un rodeo es exactamente cómo se aflojan.
      const linksPorAccion: OTLink[][] = [];
      for (const a of acciones) {
        const subidos: OTLink[] = [];
        for (const n of a.nuevosArchivos) {
          const url = await uploadToR2(n.file, "adjuntos");
          subidos.push({ url, nombre: n.nombre, tipo: "archivo", origen: "creacion" });
        }
        linksPorAccion.push([...a.links, ...subidos]);
      }

      const input = {
        nombre,
        descripcion,
        // Se aplana: cada condición es una fila de `automatizacion_triggers`
        // con el `medidor_id` de su tarjeta repetido. Es la forma que el motor
        // ya recorre, y recorrerlas por separado es justamente lo que hace que
        // se comporten como O.
        triggers: triggers.flatMap(t => t.condiciones.map(c => ({
          id: c.id,
          // `activo_id` NO viaja: es un filtro de la UI para encontrar el
          // medidor, y el disparador se identifica por `medidor_id`.
          medidor_id: t.medidor_id,
          operador: c.operador,
          valor: Number(c.valor),
          valor_hasta: c.valor_hasta.trim() === "" ? null : Number(c.valor_hasta),
          // Solo viaja si cambió: es estado del motor y reenviarlo tal cual
          // retrocedería el contador al valor que tenía al abrir el panel.
          ...(esAcumulado(c.operador) && c.proximo_disparo !== (c.proximo_disparo_inicial ?? "")
            ? { proximo_disparo: c.proximo_disparo.trim() === "" ? null : Number(c.proximo_disparo) }
            : {}),
          // El mismo modo en todas las filas del disparador: en la base es una
          // columna por fila, pero en la regla es una sola decisión.
          modo: t.modo,
          modo_n: Number(t.modo_n) || 2,
        }))),
        condiciones: condiciones.map(c => ({
          tipo: c.tipo,
          config: configDeCondicion(c),
          negado: c.negado,
        })),
        acciones: acciones.map((a, i) => {
          return {
            // Igual que en los disparadores: sin el id, la acción se recrea y el
            // freno de retrigger —que busca por accion_id— estrena historial.
            id: a.id,
            tipo: a.tipo,
            // Cada tipo escribe solo sus claves: guardar las quince de la OT en
            // un cambio de estado dejaría un config que se lee de dos maneras.
            config: configDeAccion(a, linksPorAccion[i]),
            retrigger_minutos: Number(a.retrigger) || 0,
            solo_si_anterior_cerrada: a.solo_si_anterior_cerrada,
          };
        }),
      };

      if (inicial) await updateAutomatizacion(inicial.id, input);
      else await createAutomatizacion(wsId, input);

      // Recién con el guardado hecho pasan a "ya subidos": si falla el guardado,
      // siguen en la cola y el reintento no los sube dos veces.
      setAcciones(prev => prev.map((a, i) => ({
        ...a, links: linksPorAccion[i] ?? a.links, nuevosArchivos: [],
      })));
      onGuardada();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <PanelCatalogo
      titulo={inicial ? "Editar automatización" : "Nueva automatización"}
      guardando={guardando}
      puedeGuardar={true}
      error={err}
      textoGuardar={inicial ? "Guardar" : "Crear"}
      onCancel={onClose}
      onSubmit={() => { void guardar(); }}
    >
      <input
        placeholder="¿Cómo se llama esta regla?"
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        // 20px sobre el compartido: este panel es un constructor de flujo, y el
        // nombre tiene que pesar más que los títulos de los pasos. Se anula acá
        // y no en `tituloInputStyle` porque ese estilo lo usan los demás paneles.
        style={{ ...tituloInputStyle(nombre), fontSize: 20 }}
      />
      <textarea
        placeholder="¿Para qué sirve? (opcional)"
        value={descripcion ?? ""}
        onChange={e => setDescripcion(e.target.value)}
        rows={2}
        style={{ ...textareaStyle, marginTop: 14 }}
      />

      <div style={{ ...seccionDetalle, borderBottom: "none", paddingTop: 22 }}>
        {/* Activador */}
        <Paso icono={<SlidersHorizontal size={15} />} titulo="Cuando...">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {triggers.map((t, i) => {
              const unidad = medidores.find(m => m.id === t.medidor_id)?.unidad ?? "";
              return (
                <Tarjeta
                  key={i}
                  titulo="Una lectura del medidor del activo elegido..."
                  acciones={
                    // Solo desde el segundo: el primero no se puede quitar, una
                    // automatización sin disparador no se ejecuta nunca.
                    i > 0 ? (
                      <BotonIcono
                        label="Quitar esta condición"
                        color="var(--danger)"
                        onClick={() => setTriggers(prev => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={15} />
                      </BotonIcono>
                    ) : undefined
                  }
                >
                  <div>
                    <label style={{ ...labelStyle, marginBottom: 8 }}>
                      {t.medidor_id ? "Activo" : "Activo (opcional, para filtrar)"}
                    </label>
                    {/* Con un medidor elegido el activo queda bloqueado: no es
                        un dato aparte, es el activo AL QUE CUELGA ese medidor.
                        Dejarlo editable permitía dejar en pantalla un activo que
                        contradice al medidor, y como el disparador se guarda solo
                        con `medidor_id`, lo que se viera ahí sería mentira.

                        Para cambiarlo se quita el medidor, que es justo lo que
                        dice el texto de abajo. */}
                    <SearchSelect
                      icono={<Box size={15} />}
                      placeholder="Busca un equipo…"
                      value={t.activo_id}
                      options={opcionesActivo}
                      onChange={id => setActivoDeTrigger(i, id)}
                      emptyLabel="Todos los activos"
                      disabled={Boolean(t.medidor_id)}
                    />
                    {t.medidor_id && (
                      <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5 }}>
                        Es el activo del medidor elegido. Para cambiarlo, quita el medidor.
                      </p>
                    )}
                  </div>

                  <div>
                    <label style={{ ...labelStyle, marginBottom: 8 }}>
                      Medidor (obligatorio)
                    </label>
                    <SearchSelect
                      icono={<Gauge size={15} />}
                      placeholder="Busca un medidor…"
                      value={t.medidor_id}
                      options={opcionesMedidorDe(t.activo_id)}
                      // Recíproco, como en MaintainX ("if an asset already
                      // connects to a meter, the system auto-selects it"):
                      // elegir el medidor rellena su activo. Quien sabe el
                      // nombre del medidor no tiene que buscar antes el equipo
                      // al que cuelga, y el campo de arriba deja de verse vacío
                      // cuando en realidad ya está determinado.
                      onChange={id => setTrigger(i, {
                        medidor_id: id,
                        // Al quitar el medidor se suelta también el activo: lo
                        // había puesto él, y dejarlo colgado convertiría en
                        // filtro permanente algo que el usuario nunca eligió.
                        activo_id: id
                          ? (medidores.find(m => m.id === id)?.activo_id ?? t.activo_id)
                          : "",
                      })}
                      emptyLabel="Sin medidor"
                    />
                    {/* Solo cuando el filtro deja la lista vacía: es el único
                        caso en que el campo no se puede completar y la causa
                        —el activo elegido— no es evidente. */}
                    {t.activo_id && opcionesMedidorDe(t.activo_id).length === 0 && (
                      <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--warning)", lineHeight: 1.5 }}>
                        Este activo no tiene medidores. Elige otro o deja el campo vacío para verlos todos.
                      </p>
                    )}
                  </div>

                  {/* Las condiciones no existen hasta que hay un medidor: sin
                      él no se sabe la unidad, el operador no tiene contra qué
                      compararse y la fila sería un formulario que no significa
                      nada. Es el orden de MaintainX: primero el medidor, y
                      "opcionalmente" las condiciones después. */}
                  {t.medidor_id && (
                    <>
                      {/* La línea vertical agrupa las condiciones y las separa
                          del medidor de arriba y del "Para" de abajo: deja ver
                          de un vistazo dónde empieza y dónde termina la lista de
                          alternativas, que es lo que la "O" sola no alcanzaba a
                          decir cuando hay tres. */}
                      <div style={{
                        marginLeft: 4, paddingLeft: 14,
                        borderLeft: "2px solid var(--border)",
                        display: "flex", flexDirection: "column", gap: 10,
                      }}>
                        {t.condiciones.map((c, k) => (
                          <div key={k} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {/* La "O" entre condiciones: el motor recorre los
                                disparadores del medidor por separado y le basta
                                con que uno se cumpla, así que la unión es O y no
                                Y. Decirlo evita que alguien escriba dos rangos
                                creyendo que se exigen los dos. */}
                            {k > 0 && (
                              <span style={{ fontSize: 14, color: "var(--fg-3)" }}>O</span>
                            )}

                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <Desplegable
                                value={c.operador}
                                // Solo los que esta base acepta: el CHECK viejo
                                // rechaza 'mayor' y los de cambio con un error
                                // de constraint que no le dice nada al usuario.
                                options={operadoresDisponibles()}
                                onChange={v => setCondicion(i, k, { operador: v as OperadorTrigger })}
                              />
                              <div style={{ position: "relative", width: 160, flexShrink: 0 }}>
                                <input
                                  type="number"
                                  value={c.valor}
                                  onChange={e => setCondicion(i, k, { valor: e.target.value })}
                                  placeholder="Valor"
                                  style={{ ...inputStyle, height: 40, paddingRight: unidad ? 74 : 10 }}
                                />
                                {unidad && (
                                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--fg-4)" }}>
                                    {unidad}
                                  </span>
                                )}
                              </div>
                              {c.operador === "entre" && (
                                <div style={{ position: "relative", width: 160, flexShrink: 0 }}>
                                  <input
                                    type="number"
                                    value={c.valor_hasta}
                                    onChange={e => setCondicion(i, k, { valor_hasta: e.target.value })}
                                    placeholder="Hasta"
                                    style={{ ...inputStyle, height: 40, paddingRight: unidad ? 74 : 10 }}
                                  />
                                  {unidad && (
                                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--fg-4)" }}>
                                      {unidad}
                                    </span>
                                  )}
                                </div>
                              )}
                              {/* El basurero aparece recién con dos condiciones:
                                  con una sola, borrarla dejaría el disparador sin
                                  nada que evaluar. */}
                              {t.condiciones.length > 1 && (
                                <BotonIcono
                                  label="Quitar esta condición"
                                  color="var(--fg-4)"
                                  onClick={() => quitarCondicion(i, k)}
                                >
                                  <Trash2 size={15} />
                                </BotonIcono>
                              )}
                            </div>
                            {/* Qué hace el operador elegido, en una línea.
                                Los once no se distinguen por el nombre solo:
                                "aumenta en" no dice respecto de qué, y confundir
                                el acumulado con el de salto cambia por completo
                                cuándo dispara la regla. */}
                            <p style={{ margin: 0, fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5 }}>
                              {OPERADORES.find(o => o.value === c.operador)?.ayuda}
                            </p>

                            {/* "Próximo disparo": solo los acumulados lo usan. */}
                            {esAcumulado(c.operador) && proximoDisparoDisponible() && (
                              <div>
                                <label style={{ ...labelStyle, marginBottom: 6 }}>
                                  Empezar a disparar en (opcional)
                                </label>
                                <div style={{ position: "relative", width: 200 }}>
                                  <input
                                    type="number"
                                    value={c.proximo_disparo}
                                    onChange={e => setCondicion(i, k, { proximo_disparo: e.target.value })}
                                    placeholder="Primera lectura"
                                    style={{ ...inputStyle, height: 40, paddingRight: unidad ? 74 : 10 }}
                                  />
                                  {unidad && (
                                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--fg-4)" }}>
                                      {unidad}
                                    </span>
                                  )}
                                </div>
                                <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5 }}>
                                  En qué marca del medidor se abre la primera orden. Un
                                  camión que se atiende cada {c.valor || "5.000"}{unidad ? ` ${unidad}` : ""} pero
                                  recién a partir de los 15.000 va con 15.000 acá. Déjalo
                                  vacío y el conteo arranca en la próxima lectura que llegue.
                                </p>
                              </div>
                            )}
                          </div>
                        ))}

                        <BotonAgregar onClick={() => agregarCondicion(i)}>
                          Añadir condición
                        </BotonAgregar>
                      </div>

                      {/* El "Para" va UNA vez y al final: es una sola pregunta
                          sobre el medidor —cuándo cuenta como cumplida— y no una
                          por condición. Repetirlo dejaba desplegables que podían
                          contradecirse. MaintainX tampoco lo repite. */}
                      <div style={{ marginTop: 4 }}>
                        <label style={{ ...labelStyle, marginBottom: 8 }}>Para</label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Desplegable
                            value={t.modo}
                            options={MODOS}
                            onChange={v => setTrigger(i, { modo: v as ModoTrigger })}
                          />
                          {/* El número va con su palabra: un "2" suelto al lado
                              del desplegable no dice si son lecturas, minutos o
                              veces. */}
                          {t.modo === "lecturas_multiples" && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                              <input
                                type="number"
                                min={2}
                                value={t.modo_n}
                                onChange={e => setTrigger(i, { modo_n: e.target.value })}
                                style={{ ...inputStyle, height: 40, width: 80 }}
                              />
                              <span style={{ fontSize: 14, color: "var(--fg-3)", whiteSpace: "nowrap" }}>
                                lecturas
                              </span>
                            </div>
                          )}
                        </div>
                        {MODOS.find(m => m.value === t.modo) && (
                          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5 }}>
                            {MODOS.find(m => m.value === t.modo)!.ayuda}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </Tarjeta>
              );
            })}
            <BotonAgregar onClick={() => setTriggers(prev => [...prev, TRIGGER_VACIO])}>
              Agregar otra condición de lectura
            </BotonAgregar>
          </div>
        </Paso>

        {/* Condiciones: el filtro que corre DESPUÉS del disparador. Vacío, la
            regla actúa siempre que la lectura cumpla lo de arriba, que es el
            comportamiento que tenía antes de que este paso existiera. */}
        <Paso icono={<GitBranch size={15} />} titulo="Sólo si además…">
          {!condicionesDisponibles() ? (
            // La tabla todavía no está en esta base (ver fetchAutomatizaciones).
            // Se dice, en vez de ofrecer un paso que fallaría al guardar.
            <p style={{ margin: 0, fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5, display: "flex", alignItems: "center", gap: 8 }}>
              <Lock size={15} /> Los requisitos extra todavía no están habilitados en este espacio.
            </p>
          ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {condiciones.map((c, i) => (
              <TarjetaCondicion
                key={i}
                c={c}
                onCambiar={patch => setCondiciones(prev =>
                  prev.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
                onQuitar={() => setCondiciones(prev => prev.filter((_, j) => j !== i))}
              />
            ))}

            <SelectorTipo
              opciones={TIPOS_CONDICION.map(t => ({
                value: t.value,
                label: t.label,
                // Un tipo por regla: dos tarjetas del mismo se combinan con Y,
                // así que la segunda solo puede restringir más o contradecir a
                // la primera. Los valores múltiples ya se eligen dentro.
                yaEsta: condiciones.some(c => c.tipo === t.value),
              }))}
              textoBoton={condiciones.length > 0 ? "Agregar un requisito extra" : undefined}
              etiquetaAria="Agregar requisito"
              onElegir={v => setCondiciones(prev => [...prev, condicionVacia(v)])}
            />

            {condiciones.length === 0 && (
              <p style={{ margin: 0, fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5 }}>
                Opcional. Sin requisitos, la regla actúa siempre que la lectura cumpla lo de arriba.
              </p>
            )}
          </div>
          )}
        </Paso>

        {/* Acciones */}
        <Paso icono={<Play size={15} />} titulo="Haz esto" ultimo>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {acciones.map((a, ai) => (
              <Tarjeta
                key={ai}
                // Plegada, el título es el de la OT: "Revisar bomba 3" dice
                // cuál es sin abrirla, y "Crear una orden de trabajo" repetido
                // tres veces no.
                // Plegada, el título es el de la OT: "Revisar bomba 3" dice
                // cuál es sin abrirla, y "Crear una orden de trabajo" repetido
                // tres veces no.
                titulo={a.tipo === "cambiar_estado_activo"
                  ? "Cambiar el estado del activo"
                  : (!a.abierta && a.titulo.trim()
                      ? a.titulo.trim()
                      : (acciones.filter(x => x.tipo === "crear_ot").length > 1
                          ? `Crear una orden de trabajo (${acciones.filter((x, j) => x.tipo === "crear_ot" && j <= ai).length} de ${acciones.filter(x => x.tipo === "crear_ot").length})`
                          : "Crear una orden de trabajo"))}
                subtitulo={a.tipo === "cambiar_estado_activo"
                  ? (a.abierta ? undefined : resumirCambioEstado(a, activos))
                  : (!a.abierta && a.titulo.trim() ? resumirAccion(a) : undefined)}
                abierta={a.abierta}
                // Sin título no hay nada que plegar: la tarjeta muestra la caja
                // de "Escribir la orden de trabajo" y el chevron sobraría,
                // porque plegar un formulario vacío no ahorra nada.
                onToggle={a.tipo === "cambiar_estado_activo" || a.titulo.trim()
                  ? () => setAccion(ai, { abierta: !a.abierta })
                  : undefined}
                acciones={
                  <>
                    <BotonIcono
                      label="Con qué frecuencia puede repetirse"
                      // El rect se lee ANTES de llamar a setState: React vacía
                      // `currentTarget` en cuanto el handler retorna, y el
                      // updater puede correr después, así que leerlo ahí dentro
                      // reventaba con "Cannot read properties of null".
                      onClick={e => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setAjustes(prev => (prev?.i === ai ? null : { i: ai, rect }));
                      }}
                      color={ajustes?.i === ai ? "var(--brand)" : undefined}
                    >
                      <Settings size={15} />
                    </BotonIcono>
                    <BotonIcono
                      label="Borrar lo que hace esta regla"
                      color="var(--danger)"
                      onClick={() => setConfirmarBorrar(ai)}
                    >
                      <Trash2 size={15} />
                    </BotonIcono>
                  </>
                }
              >
                {a.tipo === "cambiar_estado_activo" ? (
                  a.abierta ? (
                    <CamposCambiarEstado
                      a={a}
                      activos={activos}
                      onCambiar={patch => setAccion(ai, patch)}
                    />
                  ) : null
                ) : a.abierta ? (
                  // Mismo orden y los mismos iconos que OTCrearPanel: título,
                  // descripción y tipo de trabajo arriba; después los adjuntos de
                  // la OT (procedimientos, imágenes, archivos) y al final los
                  // campos. Quien configura una automatización ya llenó este
                  // formulario a mano muchas veces; encontrarse los campos en
                  // otro orden obliga a releerlo entero.
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {/* El título de la OT, con el mismo tratamiento que en la
                        creación manual: 20px sin caja y un subrayado de 2px que
                        se tiñe de marca al escribir. */}
                    <div style={{ marginBottom: 10 }}>
                      <input
                        type="text"
                        placeholder="¿Qué trabajo se debe realizar?"
                        value={a.titulo}
                        onChange={e => setAccion(ai, { titulo: e.target.value })}
                        style={{
                          width: "100%", fontSize: 20, fontWeight: 400,
                          color: "var(--fg-1)", border: "none", outline: "none",
                          background: "transparent", padding: "8px 0",
                          borderBottom: "2px solid " + (a.titulo ? "var(--brand)" : "var(--border)"),
                          fontFamily: "inherit", transition: "border-color 0.15s",
                        }}
                      />
                    </div>

                    {/* La descripción no lleva FieldRow ni etiqueta, igual que en
                        OTCrearPanel: la sangría de 22px la alinea con los campos
                        que sí tienen icono, y el placeholder ya dice qué es. */}
                    <div style={{ padding: "14px 0", paddingLeft: 22 }}>
                      <textarea
                        placeholder="Agregue una descripción"
                        value={a.descripcion}
                        onChange={e => setAccion(ai, { descripcion: e.target.value })}
                        rows={3}
                        style={{
                          width: "100%", fontSize: 14, color: "var(--fg-1)",
                          border: "1px solid var(--border)", borderRadius: 8,
                          padding: "12px 14px", outline: "none", resize: "vertical",
                          fontFamily: "inherit", background: "var(--surface-1)", lineHeight: 1.7, minHeight: 108,
                        }}
                      />
                    </div>

                    {/* Tipo de trabajo: arriba, como en OTCrearPanel, para
                        dejarlo resuelto antes de bajar por el resto. */}
                    <FieldRow icon={<Settings2 size={16} />} label="Tipo de trabajo">
                      <Desplegable
                        value={a.tipo_trabajo}
                        options={TIPOS_TRABAJO}
                        onChange={v => setAccion(ai, { tipo_trabajo: v })}
                      />
                    </FieldRow>

                    {/* Procedimientos. Mismo picker que la creación manual de OT:
                        es el componente, no una copia, así que la lista, la
                        búsqueda y el confirmar-al-quitar se comportan igual en los
                        dos lados. */}
                    <div style={{ padding: "14px 0" }}>
                      <ProcedimientosPicker
                        workspaceId={wsId}
                        value={a.procedimientos}
                        onChange={v => setAccion(ai, { procedimientos: v })}
                      />
                    </div>

                    {/* Imágenes. Separadas de los adjuntos por tipo de archivo y
                        no por destino: las dos listas terminan en `links`, pero
                        una imagen se elige desde la galería y un manual desde el
                        disco, y mezclarlas obliga a leer el nombre para saber
                        cuál es cuál.

                        No hay álbumes como en OTCrearPanel: ahí las fotos van a
                        `foto_grupos`, que cuelga de una OT que todavía no existe.
                        Acá la imagen es de la regla y el motor la deja en un
                        álbum de referencia de cada OT que genere. */}
                    <SeccionArchivos
                      icono={<ImageIcon size={16} />}
                      titulo="Imágenes"
                      textoVacio="PNG, JPG, WEBP…"
                      textoBoton="Agregar imagen"
                      accept="image/*"
                      items={archivosDe(a, "imagen")}
                      onAgregar={files => agregarArchivos(ai, files)}
                      onRenombrar={(it, nombre) => renombrarArchivo(ai, it, nombre)}
                      onQuitar={it => quitarArchivo(ai, it)}
                    />

                    <SeccionArchivos
                      icono={<Paperclip size={16} />}
                      titulo="Adjuntos"
                      textoVacio="PDF, Word, Excel, TXT, CSV, DWG, MP3, M4A…"
                      textoBoton="Adjuntar archivo"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.dwg,.dxf,.zip,.mp3,.m4a,.wav,.ogg,.webm,audio/*"
                      items={archivosDe(a, "adjunto")}
                      onAgregar={files => agregarArchivos(ai, files)}
                      onRenombrar={(it, nombre) => renombrarArchivo(ai, it, nombre)}
                      onQuitar={it => quitarArchivo(ai, it)}
                    />

                    <FieldRow icon={<MapPin size={16} />} label="Ubicación">
                      <SearchSelect
                        icono={<MapPin size={15} />}
                        placeholder="Elige una ubicación…"
                        value={a.ubicacion_id}
                        options={ubicaciones}
                        onChange={v => setAccion(ai, { ubicacion_id: v })}
                        emptyLabel="Sin ubicación"
                      />
                    </FieldRow>

                    <FieldRow icon={<Box size={16} />} label="Activo">
                      <SearchSelect
                        icono={<Box size={15} />}
                        placeholder="Elige un activo…"
                        value={a.activo_id}
                        options={activos}
                        onChange={v => setAccion(ai, { activo_id: v })}
                        emptyLabel="Sin activo"
                      />
                    </FieldRow>

                    <FieldRow icon={<User size={16} />} label="Asignar a">
                      <AssigneeSelect
                        usuarios={usuarios}
                        value={a.asignados}
                        onChange={v => setAccion(ai, { asignados: v })}
                      />
                      {/* Atajo: suma los miembros de una cuadrilla de una vez. Se
                          unen a los ya elegidos (Set) para no duplicar a quien ya
                          estaba. Igual que en la creación manual de OT.

                          La cuadrilla NO se guarda: se expande a personas en
                          `asignados_ids`, que es la única clave de asignación que
                          el motor lee. Si alguien entra o sale de la cuadrilla
                          después, la regla sigue apuntando a quienes estaban el
                          día que se configuró, que es lo mismo que hace una OT
                          manual. */}
                      <CuadrillaQuickAdd
                        wsId={wsId}
                        onAdd={ids => setAccion(ai, {
                          asignados: Array.from(new Set([...a.asignados, ...ids])),
                        })}
                      />
                    </FieldRow>

                    <FieldRow icon={<Clock size={16} />} label="Tiempo estimado">
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="number" min={0} value={a.horas}
                          onChange={e => setAccion(ai, { horas: e.target.value })}
                          placeholder="0" style={{ ...inputStyle, width: 90 }}
                        />
                        <span style={{ fontSize: 14, color: "var(--fg-3)" }}>Horas</span>
                        <input
                          type="number" min={0} value={a.minutos}
                          onChange={e => setAccion(ai, { minutos: e.target.value })}
                          placeholder="0" style={{ ...inputStyle, width: 90 }}
                        />
                        <span style={{ fontSize: 14, color: "var(--fg-3)" }}>Minutos</span>
                      </div>
                    </FieldRow>

                    <FieldRow icon={<Flag size={16} />} label="Prioridad">
                      <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                        {PRIORIDADES.map((p, pi) => {
                          const active = a.prioridad === p.value;
                          return (
                            <button
                              key={p.value}
                              type="button"
                              onClick={() => setAccion(ai, { prioridad: p.value })}
                              style={{
                                height: 38, padding: "0 16px",
                                border: "none",
                                borderLeft: pi === 0 ? "none" : "1px solid var(--border)",
                                background: active ? "var(--surface-hover)" : "var(--surface-1)",
                                fontSize: 14, fontWeight: 400,
                                color: active ? p.activeColor : "var(--fg-2)",
                                cursor: "pointer", fontFamily: "inherit",
                              }}
                            >
                              {p.label}
                            </button>
                          );
                        })}
                      </div>
                    </FieldRow>

                    {categorias.length > 0 && (
                      <FieldRow icon={<Tag size={16} />} label="Categorías">
                        <CategoriaMultiSelect
                          categorias={categorias}
                          value={a.categoria_ids}
                          onChange={v => setAccion(ai, { categoria_ids: v })}
                        />
                      </FieldRow>
                    )}

                    <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 14, color: "var(--fg-2)", lineHeight: 1.5 }}>
                        <input
                          type="checkbox"
                          checked={a.solo_si_anterior_cerrada}
                          onChange={e => setAccion(ai, { solo_si_anterior_cerrada: e.target.checked })}
                          style={{ marginTop: 3, flexShrink: 0 }}
                        />
                        No crear una orden nueva si la anterior de esta regla sigue abierta
                      </label>
                    </div>
                  </div>
                ) : !a.titulo.trim() ? (
                  /* Sin definir: el atajo a los campos. La referencia pone aquí
                     también "Utilizar una plantilla"; no se dibuja porque las
                     plantillas de OT no existen todavía y un botón muerto es peor
                     que uno menos.

                     Solo aparece cuando la acción no tiene título: con una OT ya
                     escrita, el encabezado ya la abre y esta caja sería una
                     segunda forma de hacer lo mismo. */
                  <button
                    type="button"
                    onClick={() => setAccion(ai, { abierta: true })}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "14px 12px", fontFamily: "inherit", fontSize: 14,
                      border: "1px solid var(--border)", borderRadius: "var(--r-md)",
                      background: "var(--surface-1)", color: "var(--brand)", cursor: "pointer",
                    }}
                  >
                    <Inbox size={15} />
                    <span style={{ flex: 1, textAlign: "left" }}>Escribir la orden de trabajo</span>
                    <ChevronRight size={15} style={{ color: "var(--fg-4)" }} />
                  </button>
                ) : null}
              </Tarjeta>
            ))}

            {/* Varias acciones = varias cosas con la misma lectura: abrir la OT
                del eléctrico, la del mecánico y además marcar el activo fuera de
                servicio. El motor ya las recorría todas y frena cada una por
                separado (`accion_id`).

                El selector lista los cuatro tipos del enum, con candado en los
                dos que el motor todavía no ejecuta: esconderlos haría parecer
                que la lista está completa. */}
            <SelectorTipo
              opciones={TIPOS_ACCION.map(t => ({ value: t.value, label: t.label }))}
              // Vacío el paso, la lista se muestra desplegada: es el contenido
              // del paso, no algo escondido detrás de un botón.
              textoBoton={acciones.length > 0 ? "Agregar otra acción" : undefined}
              etiquetaAria="Agregar acción"
              icono={v => (v === "crear_ot" ? <Inbox size={15} /> : <Settings2 size={15} />)}
              onElegir={v => setAcciones(prev => [...prev, accionVacia(true, v)])}
            />
          </div>
        </Paso>
      </div>

      {ajustes && (
        <PopoverFrecuencia
          valor={acciones[ajustes.i]?.retrigger ?? "5"}
          onChange={v => setAccion(ajustes.i, { retrigger: v })}
          onClose={() => setAjustes(null)}
          ancla={ajustes.rect}
        />
      )}

      {/* Por un portal a document.body y no en su sitio del árbol: el panel es
          un ancestro posicionado, así que un `position: fixed` dentro se resolvía
          contra él y el velo dejaba fuera la barra superior y la barra lateral.
          Es el mismo recurso que usa RegistrarLecturaDialog, con su mismo
          z-index. */}
      {confirmarBorrar !== null && typeof document !== "undefined" && createPortal(
        <div
          onClick={() => setConfirmarBorrar(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 500, display: "flex",
            alignItems: "center", justifyContent: "center",
            background: "rgba(15,23,42,0.45)", padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 420, padding: 22,
              background: "var(--surface-1)", border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-lg)",
            }}
          >
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: "var(--fg-1)" }}>
              Eliminar esta acción
            </h3>
            <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--fg-3)", lineHeight: 1.5 }}>
              {acciones.length > 1
                ? "Se quita esta orden de trabajo de la regla. Las demás siguen igual."
                : "Se borran los campos de la orden de trabajo que dejaste preparados. La regla no puede guardarse sin una acción."}
            </p>
            <div style={{ marginTop: 22, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmarBorrar(null)}
                style={{
                  height: 38, padding: "0 16px", border: "none", background: "none",
                  fontFamily: "inherit", fontSize: 14, color: "var(--brand)", cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  // Se quita, siempre. Antes la última se vaciaba en vez de
                  // borrarse, porque sin acciones el paso quedaba en blanco;
                  // ahora el paso vacío es el selector de tipo, así que dejar
                  // una tarjeta hueca era una acción sin definir que no se podía
                  // sacar de encima.
                  //
                  // Los links se sueltan, pero el objeto en R2 se queda: las OT
                  // ya generadas lo siguen apuntando.
                  setAcciones(prev => prev.filter((_, j) => j !== confirmarBorrar));
                  setConfirmarBorrar(null);
                }}
                style={{
                  height: 38, padding: "0 16px", border: "none",
                  borderRadius: "var(--r-md)", background: "var(--brand)",
                  fontFamily: "inherit", fontSize: 14, color: "#fff", cursor: "pointer",
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </PanelCatalogo>
  );
}
