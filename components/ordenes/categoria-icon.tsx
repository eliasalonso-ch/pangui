"use client";

import {
  Tag, CheckCircle2, Thermometer, AlertTriangle, Zap, Building2, Droplet, Droplets,
  Flame, Eye, Activity, Paintbrush, Wrench, Leaf, Palette, Shield, Wifi,
  type LucideIcon,
} from "lucide-react";

// Categoría icons are stored as Ionicons names (set on mobile, rendered there
// with <Ionicons>). The web uses lucide-react, so map the known names to the
// closest lucide icon. Unknown names fall back to a generic tag.
const IONICON_TO_LUCIDE: Record<string, LucideIcon> = {
  "checkmark-circle-outline": CheckCircle2,
  "thermometer-outline":      Thermometer,
  "warning-outline":          AlertTriangle,
  "flash-outline":            Zap,
  "business-outline":         Building2,
  "water-outline":            Droplet,
  "bonfire-outline":          Flame,
  "eye-outline":              Eye,
  "pulse-outline":            Activity,
  "brush-outline":            Paintbrush,
  "color-filter-outline":     Droplets,
  "construct-outline":        Wrench,
  "leaf-outline":             Leaf,
  "color-palette-outline":    Palette,
  "shield-outline":           Shield,
  "wifi-outline":             Wifi,
  "pricetag-outline":         Tag,
};

export function CategoriaIcon({ icono, size = 14, color }: {
  icono?: string | null;
  size?: number;
  color?: string;
}) {
  const Icon = (icono && IONICON_TO_LUCIDE[icono]) || Tag;
  // No `color` → lucide inherits currentColor (matches surrounding text/chip).
  return <Icon size={size} color={color} />;
}
