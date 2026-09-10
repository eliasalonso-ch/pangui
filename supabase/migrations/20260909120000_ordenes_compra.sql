-- Ordenes de compra: el eslabon que faltaba entre el plan de mantencion y el
-- proveedor.
--
-- Hasta ahora el ciclo se cortaba a la mitad. El plan ya sabe QUE se necesita
-- (plan_materiales, 20260908210000) y CUANDO (plan_ocurrencias), y el catalogo
-- ya sabe cuanto hay en bodega (partes.stock_actual) y a quien se le compra
-- (proveedores, material_proveedores). Lo que no existia era el documento: la
-- orden de compra propiamente tal, con su numero, su proveedor y sus lineas.
--
-- El comentario de EstadoOcurrencia.avisada en types/planes.ts ya reservaba el
-- lugar ("Aqui colgara la orden de compra"); esta migracion lo ocupa.
--
-- QUE NO HACE: no emite documentos tributarios. Una orden de compra es un
-- documento comercial entre comprador y proveedor, no un DTE — no se declara al
-- SII ni reemplaza a la factura que el proveedor emite despues. Por eso vive
-- aparte de documentos_tributarios.

-- ── Datos del emisor, para la cabecera del PDF ───────────────────────────────
-- Una orden de compra chilena identifica al comprador con razon social, RUT y
-- giro. El workspace ya guardaba solo `nombre` (un alias para la UI) y
-- `logo_url`, que no alcanzan para un documento que sale de la empresa.
--
-- Van en workspaces y no en sociedades porque el 99% de los clientes factura
-- con un solo RUT: pedirlo una vez en Ajustes y que salga en toda OC es el
-- camino corto. Quien tenga varias sociedades ya las modela en su tabla.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS razon_social text,
  ADD COLUMN IF NOT EXISTS rut text,
  ADD COLUMN IF NOT EXISTS giro text,
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS email_contacto text,
  ADD COLUMN IF NOT EXISTS sitio_web text;

-- ── Proveedores: de lookup a entidad con datos legales ───────────────────────
-- La tabla tenia 7 columnas (nombre, contacto, email, telefono) porque solo
-- alimentaba un selector en el formulario de activos. Para emitirle una orden
-- de compra hace falta el bloque "SEÑORES:" completo del documento: RUT, giro y
-- direccion. Todo opcional salvo `activo`: un proveedor con solo nombre sigue
-- sirviendo para el selector, y obligar RUT romperia las filas que ya existen.
ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS rut text,
  ADD COLUMN IF NOT EXISTS giro text,
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS comuna text,
  ADD COLUMN IF NOT EXISTS ciudad text,
  ADD COLUMN IF NOT EXISTS condiciones_pago text,
  ADD COLUMN IF NOT EXISTS sitio_web text,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actualizado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS proveedores_workspace_idx
  ON public.proveedores (workspace_id) WHERE activo;

-- Las politicas viejas dejaban escribir a cualquier miembro del workspace. Con
-- Proveedores convertido en modulo con menu propio (y gate isAdmin en el
-- sidebar) eso seria un candado de adorno: la URL se escribe a mano. Se alinean
-- con planes/plan_materiales, donde escribir es de owner/admin.
DROP POLICY IF EXISTS proveedores_insert ON public.proveedores;
DROP POLICY IF EXISTS proveedores_update ON public.proveedores;
DROP POLICY IF EXISTS proveedores_delete ON public.proveedores;

DROP POLICY IF EXISTS proveedores_write ON public.proveedores;
CREATE POLICY proveedores_write ON public.proveedores
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = auth.uid() AND u.workspace_id = proveedores.workspace_id
      AND u.rol IN ('owner','admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = auth.uid() AND u.workspace_id = proveedores.workspace_id
      AND u.rol IN ('owner','admin')
  ));

-- ── Contador de numero por workspace ─────────────────────────────────────────
-- Mismo mecanismo que planes (20260908260000) y por la misma razon, que aca
-- pesa mas: una OC se borra de verdad y ademas se referencia fuera del sistema
-- ("la OC #14 que te mande por correo"). Con MAX(numero)+1, borrar la ultima
-- hace que la siguiente reuse el numero y esa referencia pase a apuntar a otro
-- documento. El contador guarda el ultimo numero ENTREGADO, no el mayor vigente.
CREATE TABLE IF NOT EXISTS public.ordenes_compra_numero_contador (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ultimo_numero integer NOT NULL DEFAULT 0
);

ALTER TABLE public.ordenes_compra_numero_contador ENABLE ROW LEVEL SECURITY;

-- Solo lectura: quien escribe es el trigger, que corre como SECURITY DEFINER.
DROP POLICY IF EXISTS ordenes_compra_numero_contador_select ON public.ordenes_compra_numero_contador;
CREATE POLICY ordenes_compra_numero_contador_select ON public.ordenes_compra_numero_contador
  FOR SELECT USING (workspace_id = my_workspace_id());

-- ── La orden de compra ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ordenes_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Correlativo interno que entrega el trigger. `numero_manual` es aparte
  -- porque muchas empresas arrastran su propia nomenclatura ("OC-2026-014") y
  -- necesitan escribirla tal cual; cuando existe, manda en el PDF.
  numero integer,
  numero_manual text,

  -- El proveedor puede faltar mientras la OC es borrador: primero se arma la
  -- lista de lo que falta y despues se decide a quien comprarle.
  proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE SET NULL,

  estado text NOT NULL DEFAULT 'borrador',

  -- Trazabilidad hacia el origen. `plan_ocurrencia_id` es ademas la llave de
  -- idempotencia del cron: es lo que impide que una misma ocurrencia genere una
  -- OC nueva cada dia que sigue dentro de la ventana de aviso.
  plan_id uuid REFERENCES public.planes_mantencion(id) ON DELETE SET NULL,
  plan_ocurrencia_id uuid REFERENCES public.plan_ocurrencias(id) ON DELETE SET NULL,
  orden_trabajo_id uuid REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL,
  origen text NOT NULL DEFAULT 'manual',

  fecha_emision date NOT NULL DEFAULT CURRENT_DATE,
  fecha_entrega_esperada date,
  direccion_despacho text,
  condiciones_pago text,
  moneda text NOT NULL DEFAULT 'CLP',

  -- Montos en CLP entero. Se guardan calculados (no se derivan al leer) porque
  -- un documento ya enviado no puede cambiar de total si manana sube el precio
  -- de una parte del catalogo.
  neto numeric NOT NULL DEFAULT 0,
  descuento numeric NOT NULL DEFAULT 0,
  otros_costos numeric NOT NULL DEFAULT 0,
  iva numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,

  observaciones text,
  adjuntos jsonb NOT NULL DEFAULT '[]'::jsonb,

  aprobada_at timestamptz,
  aprobada_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  rechazada_motivo text,

  enviada_at timestamptz,
  enviada_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  enviada_a_email text,

  creado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  actualizado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ordenes_compra_estado_check CHECK (estado IN (
    'borrador', 'pendiente_aprobacion', 'aprobada', 'enviada',
    'recibida_parcial', 'completada', 'rechazada', 'cancelada'
  )),
  CONSTRAINT ordenes_compra_origen_check CHECK (origen IN ('manual', 'plan_mantencion'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ordenes_compra_numero_ws_idx
  ON public.ordenes_compra (workspace_id, numero);

CREATE INDEX IF NOT EXISTS ordenes_compra_ws_estado_idx
  ON public.ordenes_compra (workspace_id, estado);

CREATE INDEX IF NOT EXISTS ordenes_compra_proveedor_idx
  ON public.ordenes_compra (proveedor_id);

CREATE INDEX IF NOT EXISTS ordenes_compra_plan_idx
  ON public.ordenes_compra (plan_id);

-- Parcial y unico: una ocurrencia genera como maximo una OC. El indice es la
-- garantia real de la idempotencia — el WHERE NOT EXISTS del cron puede perder
-- una carrera entre dos corridas simultaneas, esto no.
CREATE UNIQUE INDEX IF NOT EXISTS ordenes_compra_ocurrencia_idx
  ON public.ordenes_compra (plan_ocurrencia_id)
  WHERE plan_ocurrencia_id IS NOT NULL;

ALTER TABLE public.ordenes_compra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ordenes_compra_select ON public.ordenes_compra;
CREATE POLICY ordenes_compra_select ON public.ordenes_compra
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = auth.uid() AND u.workspace_id = ordenes_compra.workspace_id
  ));

-- Comprar compromete plata: escribir es de owner/admin, igual que planes.
DROP POLICY IF EXISTS ordenes_compra_write ON public.ordenes_compra;
CREATE POLICY ordenes_compra_write ON public.ordenes_compra
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = auth.uid() AND u.workspace_id = ordenes_compra.workspace_id
      AND u.rol IN ('owner','admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = auth.uid() AND u.workspace_id = ordenes_compra.workspace_id
      AND u.rol IN ('owner','admin')
  ));

-- ── Lineas ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ordenes_compra_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_compra_id uuid NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,

  -- Nullable a proposito: una OC tambien compra cosas que no estan en el
  -- catalogo (un flete, un servicio de maestranza, un repuesto que se compra
  -- una sola vez). Sin parte_id la linea existe igual, solo que no descuenta ni
  -- suma stock al recibirse.
  parte_id uuid REFERENCES public.partes(id) ON DELETE RESTRICT,

  -- Se copian del catalogo al crear la linea en vez de leerse por join: el
  -- documento tiene que seguir diciendo lo mismo dentro de un año, aunque la
  -- parte se renombre o cambie de precio.
  descripcion text NOT NULL,
  codigo text,
  unidad text NOT NULL DEFAULT 'un',

  cantidad numeric NOT NULL CHECK (cantidad > 0),
  precio_unitario numeric NOT NULL DEFAULT 0,
  descuento numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,

  cantidad_recibida numeric NOT NULL DEFAULT 0 CHECK (cantidad_recibida >= 0),

  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ordenes_compra_lineas_oc_idx
  ON public.ordenes_compra_lineas (orden_compra_id);

ALTER TABLE public.ordenes_compra_lineas ENABLE ROW LEVEL SECURITY;

-- Se hereda el permiso del padre: si puedes ver la OC, ves sus lineas.
DROP POLICY IF EXISTS ordenes_compra_lineas_select ON public.ordenes_compra_lineas;
CREATE POLICY ordenes_compra_lineas_select ON public.ordenes_compra_lineas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ordenes_compra oc
    JOIN public.usuarios u ON u.workspace_id = oc.workspace_id
    WHERE oc.id = orden_compra_id AND u.id = auth.uid()
  ));

DROP POLICY IF EXISTS ordenes_compra_lineas_write ON public.ordenes_compra_lineas;
CREATE POLICY ordenes_compra_lineas_write ON public.ordenes_compra_lineas
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ordenes_compra oc
    JOIN public.usuarios u ON u.workspace_id = oc.workspace_id
    WHERE oc.id = orden_compra_id AND u.id = auth.uid() AND u.rol IN ('owner','admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ordenes_compra oc
    JOIN public.usuarios u ON u.workspace_id = oc.workspace_id
    WHERE oc.id = orden_compra_id AND u.id = auth.uid() AND u.rol IN ('owner','admin')
  ));

-- ── Trigger del correlativo ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_assign_orden_compra_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Un numero explicito se respeta (sirve para migrar o restaurar).
  IF NEW.numero IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ON CONFLICT DO UPDATE toma el lock de la fila del contador, asi que dos
  -- altas simultaneas del mismo workspace se serializan.
  INSERT INTO public.ordenes_compra_numero_contador AS c (workspace_id, ultimo_numero)
  VALUES (NEW.workspace_id, 1)
  ON CONFLICT (workspace_id) DO UPDATE
    SET ultimo_numero = c.ultimo_numero + 1
  RETURNING ultimo_numero INTO NEW.numero;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_orden_compra_numero ON public.ordenes_compra;
CREATE TRIGGER trg_assign_orden_compra_numero
  BEFORE INSERT ON public.ordenes_compra
  FOR EACH ROW EXECUTE FUNCTION public.fn_assign_orden_compra_numero();

-- ── updated_at ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ordenes_compra_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ordenes_compra_touch ON public.ordenes_compra;
CREATE TRIGGER trg_ordenes_compra_touch
  BEFORE UPDATE ON public.ordenes_compra
  FOR EACH ROW EXECUTE FUNCTION public.ordenes_compra_touch();
