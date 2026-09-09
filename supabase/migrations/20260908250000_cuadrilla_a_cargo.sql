-- Cuadrilla a cargo: reemplaza el texto libre `grupo_cargo` por un vinculo real
-- a `cuadrillas`, y permite que un activo tenga varias cuadrillas a cargo.
--
-- Por que: `grupo_cargo` era un input de texto en ubicaciones, lugares y
-- sociedades. Al ser texto suelto no se puede filtrar, no dice quienes son y
-- cada quien lo escribe distinto ("Mant. electrico" vs "Mantenimiento
-- Eléctrico"). Las tablas `cuadrillas` y `cuadrilla_usuarios` ya existian; lo
-- que faltaba era conectarlas con los catalogos.
--
-- NO se toca la asignacion de las OTs: una OT sigue teniendo responsables
-- personales (`asignados_ids`). La cuadrilla es un dato del activo/ubicacion
-- ("la cuadrilla electrica mantiene esta bomba"), no del trabajo puntual.

-- ── Cuadrilla a cargo en los catalogos de ubicacion ──────────────────────────
-- Una sola por fila: un edificio tiene UNA cuadrilla responsable.
ALTER TABLE public.ubicaciones
  ADD COLUMN IF NOT EXISTS cuadrilla_id uuid REFERENCES public.cuadrillas(id) ON DELETE SET NULL;

ALTER TABLE public.lugares
  ADD COLUMN IF NOT EXISTS cuadrilla_id uuid REFERENCES public.cuadrillas(id) ON DELETE SET NULL;

ALTER TABLE public.sociedades
  ADD COLUMN IF NOT EXISTS cuadrilla_id uuid REFERENCES public.cuadrillas(id) ON DELETE SET NULL;

-- ON DELETE SET NULL y no CASCADE: borrar una cuadrilla no puede llevarse por
-- delante la ubicacion. De todos modos el borrado real es logico (activo=false).

CREATE INDEX IF NOT EXISTS idx_ubicaciones_cuadrilla ON public.ubicaciones(cuadrilla_id) WHERE cuadrilla_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lugares_cuadrilla     ON public.lugares(cuadrilla_id)     WHERE cuadrilla_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sociedades_cuadrilla  ON public.sociedades(cuadrilla_id)  WHERE cuadrilla_id IS NOT NULL;

-- `grupo_cargo` se deja en su sitio a proposito: hay 3 ubicaciones que lo usan
-- y el texto es lo unico que dice que habia ahi. Se retira en otra migracion,
-- una vez que esas 3 esten reasignadas a una cuadrilla.

-- ── Cuadrillas a cargo de un activo (varias) ─────────────────────────────────
-- Un equipo suele necesitar mas de un oficio (electrica + mecanica), asi que
-- aca la relacion es N a N y no una columna.
CREATE TABLE IF NOT EXISTS public.activo_cuadrillas (
  activo_id    uuid NOT NULL REFERENCES public.activos(id)    ON DELETE CASCADE,
  cuadrilla_id uuid NOT NULL REFERENCES public.cuadrillas(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  PRIMARY KEY (activo_id, cuadrilla_id)
);

-- La PK ya cubre las busquedas por activo (es la primera columna); este indice
-- es para el sentido contrario: "que activos mantiene esta cuadrilla".
CREATE INDEX IF NOT EXISTS idx_activo_cuadrillas_cuadrilla ON public.activo_cuadrillas(cuadrilla_id);

ALTER TABLE public.activo_cuadrillas ENABLE ROW LEVEL SECURITY;

-- Mismas reglas que `cuadrilla_usuarios`: el alcance sale del activo, que ya
-- esta acotado por workspace. Sin esto la tabla queda visible entre empresas.
DROP POLICY IF EXISTS activo_cuadrillas_select ON public.activo_cuadrillas;
CREATE POLICY activo_cuadrillas_select ON public.activo_cuadrillas
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.activos a
            WHERE a.id = activo_cuadrillas.activo_id
              AND a.workspace_id = my_workspace_id())
  );

DROP POLICY IF EXISTS activo_cuadrillas_insert ON public.activo_cuadrillas;
CREATE POLICY activo_cuadrillas_insert ON public.activo_cuadrillas
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.activos a
            WHERE a.id = activo_cuadrillas.activo_id
              AND a.workspace_id = my_workspace_id())
    AND EXISTS (SELECT 1 FROM public.cuadrillas c
                WHERE c.id = activo_cuadrillas.cuadrilla_id
                  AND c.workspace_id = my_workspace_id())
  );

DROP POLICY IF EXISTS activo_cuadrillas_delete ON public.activo_cuadrillas;
CREATE POLICY activo_cuadrillas_delete ON public.activo_cuadrillas
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.activos a
            WHERE a.id = activo_cuadrillas.activo_id
              AND a.workspace_id = my_workspace_id())
  );

-- ── Foto de la cuadrilla ─────────────────────────────────────────────────────
-- Se sube a R2 como el resto de las imagenes del sistema (ubicaciones,
-- activos, partes): aca solo se guarda la URL publica.
ALTER TABLE public.cuadrillas ADD COLUMN IF NOT EXISTS imagen_url text;
