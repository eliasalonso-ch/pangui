/**
 * Presets de apariencia de categorías.
 *
 * Copiados tal cual de la app móvil (`app/(stack)/nueva-categoria.tsx`) para que
 * una categoría creada en la web se vea idéntica en el teléfono. Si se agrega
 * un ícono acá, hay que agregarlo allá y en `components/ordenes/categoria-icon.tsx`,
 * que es quien traduce el nombre Ionicon al equivalente lucide en la web.
 */

export const PRESET_ICONOS: { ionicon: string; label: string }[] = [
  { ionicon: "flash-outline",            label: "Eléctrico" },
  { ionicon: "construct-outline",        label: "Mecánico" },
  { ionicon: "pulse-outline",            label: "Monitoreo" },
  { ionicon: "water-outline",            label: "Agua" },
  { ionicon: "business-outline",         label: "Edificio" },
  { ionicon: "thermometer-outline",      label: "Temperatura" },
  { ionicon: "bonfire-outline",          label: "Fuego" },
  { ionicon: "shield-outline",           label: "Seguridad" },
  { ionicon: "eye-outline",              label: "Inspección" },
  { ionicon: "color-filter-outline",     label: "Filtro" },
  { ionicon: "brush-outline",            label: "Pintura" },
  { ionicon: "color-palette-outline",    label: "Acabados" },
  { ionicon: "wifi-outline",             label: "Redes" },
  { ionicon: "warning-outline",          label: "Alerta" },
  { ionicon: "checkmark-circle-outline", label: "Verificación" },
  { ionicon: "leaf-outline",             label: "Áreas verdes" },
];

export const PRESET_COLORES: { hex: string; label: string }[] = [
  { hex: "#EF4444", label: "Rojo" },
  { hex: "#F97316", label: "Naranjo" },
  { hex: "#EAB308", label: "Amarillo" },
  { hex: "#22C55E", label: "Verde" },
  { hex: "#06B6D4", label: "Cian" },
  { hex: "#3B82F6", label: "Azul" },
  { hex: "#8B5CF6", label: "Morado" },
  { hex: "#EC4899", label: "Rosado" },
  { hex: "#6B7280", label: "Gris" },
  { hex: "#273D88", label: "Azul Pangui" },
];
