-- Remove all existing defaults
DELETE FROM public.categorias_ot WHERE es_default = true AND workspace_id IS NULL;

-- Insert ISO-aligned default categories with Ionicons icon names
INSERT INTO public.categorias_ot (nombre, icono, color, es_default, workspace_id) VALUES
  ('Eléctrico',             'flash-outline',              '#F59E0B', true, null),
  ('Mecánico',              'settings-outline',           '#6B7280', true, null),
  ('Instrumentación',       'pulse-outline',              '#3B82F6', true, null),
  ('Gasfitería / Hidráulico','water-outline',             '#06B6D4', true, null),
  ('Estructura / Civil',    'business-outline',           '#F97316', true, null),
  ('Climatización (HVAC)',  'thermometer-outline',        '#0EA5E9', true, null),
  ('Incendio / PCI',        'flame-outline',              '#EF4444', true, null),
  ('Seguridad',             'shield-checkmark-outline',   '#D97706', true, null),
  ('Inspección',            'eye-outline',                '#6366F1', true, null),
  ('Lubricación',           'water-sharp',                '#84CC16', true, null),
  ('Limpieza / Aseo',       'sparkles-outline',           '#22C55E', true, null),
  ('Pintura / Revestimiento','brush-outline',             '#EC4899', true, null),
  ('TI / Comunicaciones',   'wifi-outline',               '#14B8A6', true, null),
  ('Daño / Avería',         'warning-outline',            '#F43F5E', true, null),
  ('Certificación / Prueba','checkmark-circle-outline',   '#8B5CF6', true, null),
  ('Paisajismo',            'leaf-outline',               '#16A34A', true, null);
;
